// HIVE en Cloudflare: un solo Worker sirve la app (Dashboard + lector del celular) y el relé de lecturas en vivo.
//   /api/*      → relé (misma API que el relé local de Vite: vite/hiveRelay.ts)
//   lo demás    → archivos estáticos del build (dist/), vía el binding ASSETS
// El relé vive en un Durable Object (`Relay`, una sola instancia "demo") que mantiene abiertas las conexiones SSE
// de los Dashboards y les difunde cada lectura. No guarda datos: el estado de la demo vive en el navegador.
import catalog from '../../beacons/beacons.json';
import { MAX_BODY, normalizeRead, sseFrame, type RelayRead } from '../relay/protocol';

// Tipos mínimos del runtime de Workers (evita depender de @cloudflare/workers-types).
export interface DurableObjectStubLike { fetch(input: string, init?: RequestInit): Promise<Response> }
export interface DurableObjectNamespaceLike { idFromName(name: string): unknown; get(id: unknown): DurableObjectStubLike }
export interface FetcherLike { fetch(request: Request): Promise<Response> }
export interface Env { RELAY: DurableObjectNamespaceLike; ASSETS: FetcherLike }

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const relay = (env: Env) => env.RELAY.get(env.RELAY.idFromName('demo'));

/** Rutas /api/*. Devuelve null si la ruta no es de la API (la sirve ASSETS). */
export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith('/api/')) return null;
  if (pathname === '/api/beacons' && request.method === 'GET') return json(200, catalog);
  if (pathname === '/api/estado' && request.method === 'GET') return relay(env).fetch('https://relay/estado');
  if (pathname === '/api/lecturas/stream' && request.method === 'GET') return relay(env).fetch('https://relay/stream');
  if (pathname === '/api/lecturas' && request.method === 'POST') {
    const text = await request.text();
    if (text.length > MAX_BODY) return json(413, { ok: false, error: 'Cuerpo demasiado grande.' });
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return json(400, { ok: false, error: 'JSON inválido.' }); }
    const read = normalizeRead(raw);
    if (typeof read === 'string') return json(400, { ok: false, error: read });
    const res = await relay(env).fetch('https://relay/broadcast', { method: 'POST', body: JSON.stringify(read) });
    const { pantallas } = (await res.json()) as { pantallas: number };
    return json(200, { ok: true, pantallas, lectura: read });
  }
  return json(404, { ok: false, error: 'Ruta no encontrada.' });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await handleApi(request, env)) ?? env.ASSETS.fetch(request);
  },
};

/** Durable Object: conexiones SSE abiertas y difusión de lecturas. */
export class Relay {
  private writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private encoder = new TextEncoder();
  private ping: ReturnType<typeof setInterval> | null = null;

  private send(chunk: string) {
    const bytes = this.encoder.encode(chunk);
    for (const w of this.writers) {
      w.write(bytes).catch(() => { this.writers.delete(w); }); // pantalla cerrada: se descarta
    }
    if (this.writers.size === 0 && this.ping) { clearInterval(this.ping); this.ping = null; }
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/stream') {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();
      this.writers.add(writer);
      void writer.write(this.encoder.encode(': conectado\n\n')).catch(() => this.writers.delete(writer));
      if (!this.ping) this.ping = setInterval(() => this.send(': ping\n\n'), 15000);
      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
      });
    }
    if (pathname === '/broadcast' && request.method === 'POST') {
      const read = (await request.json()) as RelayRead;
      this.send(sseFrame(read));
      return json(200, { pantallas: this.writers.size });
    }
    if (pathname === '/estado') return json(200, { ok: true, pantallas: this.writers.size });
    return json(404, { ok: false });
  }
}
