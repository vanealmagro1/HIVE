// Relé en la nube (Worker + Durable Object) probado en Node con objetos Request/Response estándar.
import { describe, expect, it } from 'vitest';
import { normalizeRead } from '../relay/protocol';
import worker, { handleApi, Relay, type Env } from './index';

function fakeEnv(): Env {
  const instance = new Relay(); // una sola instancia, como idFromName('demo')
  return {
    RELAY: { idFromName: () => 'demo', get: () => ({ fetch: (input: string, init?: RequestInit) => instance.fetch(new Request(input, init)) }) },
    ASSETS: { fetch: async () => new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }) },
  };
}
const post = (body: unknown) => new Request('https://hive.test/api/lecturas', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('protocolo del relé', () => {
  it('normaliza y valida lecturas', () => {
    expect(normalizeRead({ beacon: ' 4 ', ubicacion: 'b-05-03', rssi: -36.4, lector: 'celular', t: 1000 })).toEqual({
      id: 'celular-4-1000', beacon: '4', ubicacion: 'B-05-03', rssi: -36, lector: 'celular', t: 1000,
    });
    expect(normalizeRead({ beacon: '4' })).toMatch(/ubicacion/);
    expect(normalizeRead(null)).toMatch(/objeto JSON/);
  });
});

describe('Worker de HIVE en Cloudflare', () => {
  it('sirve el catálogo, el estado y deja lo demás a los archivos estáticos', async () => {
    const env = fakeEnv();
    const cat = (await (await worker.fetch(new Request('https://hive.test/api/beacons'), env)).json()) as { beacons: { etiqueta: string }[] };
    expect(cat.beacons.map((b) => b.etiqueta)).toContain('4');
    expect(await (await worker.fetch(new Request('https://hive.test/api/estado'), env)).json()).toEqual({ ok: true, pantallas: 0 });
    expect(await (await worker.fetch(new Request('https://hive.test/lector.html'), env)).text()).toBe('<html>app</html>');
    expect((await handleApi(new Request('https://hive.test/api/otra'), env))!.status).toBe(404);
  });

  it('rechaza lecturas inválidas', async () => {
    const env = fakeEnv();
    expect((await worker.fetch(post('{no es json'), env)).status).toBe(400);
    expect((await worker.fetch(post({ beacon: '4', ubicacion: 'cualquiera' }), env)).status).toBe(400);
  });

  it('una lectura llega a todas las pantallas conectadas por SSE', async () => {
    const env = fakeEnv();
    const stream = await worker.fetch(new Request('https://hive.test/api/lecturas/stream'), env);
    expect(stream.headers.get('Content-Type')).toBe('text/event-stream');
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe(': conectado\n\n');

    const res = await worker.fetch(post({ beacon: '7', ubicacion: 'B-01-03', rssi: -40, lector: 'celular', t: 5 }), env);
    expect(await res.json()).toMatchObject({ ok: true, pantallas: 1, lectura: { id: 'celular-7-5', beacon: '7' } });
    const frame = decoder.decode((await reader.read()).value);
    expect(frame.startsWith('data: ')).toBe(true);
    expect(JSON.parse(frame.slice(6))).toMatchObject({ beacon: '7', ubicacion: 'B-01-03', rssi: -40 });
    await reader.cancel();
  });
});
