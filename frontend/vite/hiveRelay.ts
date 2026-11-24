// Relé local de lecturas en vivo (solo demo, sin dependencias):
//   POST /api/lecturas          ← el celular (lector.html) o el escáner de la laptop envían una lectura de beacon
//   GET  /api/lecturas/stream   → HIVE recibe las lecturas al instante (Server-Sent Events)
//   GET  /api/beacons           → catálogo de beacons (beacons/beacons.json): ids, producto y ubicaciones
//   GET  /api/estado            → cuántas pantallas de HIVE están escuchando
// Funciona en `vite` (dev) y `vite preview`. Todo en la misma red local; no sale a internet.
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export interface RelayRead {
  id: string;
  beacon: string;
  ubicacion: string;
  rssi: number | null;
  lector: string;
  t: number;
}

const MAX_BODY = 4096;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > MAX_BODY) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Valida y normaliza una lectura recibida. */
export function normalizeRead(raw: unknown, now = Date.now()): RelayRead | string {
  if (!raw || typeof raw !== 'object') return 'Se esperaba un objeto JSON.';
  const r = raw as Record<string, unknown>;
  const beacon = typeof r.beacon === 'string' ? r.beacon.trim() : '';
  const ubicacion = typeof r.ubicacion === 'string' ? r.ubicacion.trim().toUpperCase() : '';
  if (!beacon || beacon.length > 16) return 'Falta "beacon" (etiqueta del beacon, p. ej. "4").';
  if (!/^[A-Z]{1,3}-\d{2}-\d{2}$/.test(ubicacion)) return 'Falta "ubicacion" válida (p. ej. "B-05-03").';
  const lector = typeof r.lector === 'string' && r.lector.trim() ? r.lector.trim().slice(0, 24) : 'lector';
  const t = typeof r.t === 'number' && Number.isFinite(r.t) ? r.t : now;
  const rssi = typeof r.rssi === 'number' && Number.isFinite(r.rssi) ? Math.round(r.rssi) : null;
  return { id: `${lector}-${beacon}-${t}`.replace(/[^\w.-]/g, '_'), beacon, ubicacion, rssi, lector, t };
}

export function hiveRelay(catalogPath: string): Plugin {
  const clients = new Set<ServerResponse>();

  const broadcast = (read: RelayRead) => {
    const frame = `data: ${JSON.stringify(read)}\n\n`;
    for (const c of clients) c.write(frame);
  };

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = (req.url ?? '').split('?')[0];
    if (url === '/api/lecturas/stream' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(': conectado\n\n');
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (url === '/api/lecturas' && req.method === 'POST') {
      try {
        const read = normalizeRead(JSON.parse(await readBody(req)));
        if (typeof read === 'string') return sendJson(res, 400, { ok: false, error: read });
        broadcast(read);
        return sendJson(res, 200, { ok: true, pantallas: clients.size, lectura: read });
      } catch {
        return sendJson(res, 400, { ok: false, error: 'JSON inválido.' });
      }
    }
    if (url === '/api/beacons' && req.method === 'GET') {
      try {
        return sendJson(res, 200, JSON.parse(fs.readFileSync(catalogPath, 'utf8')));
      } catch {
        return sendJson(res, 500, { ok: false, error: `No se pudo leer ${catalogPath}` });
      }
    }
    if (url === '/api/estado' && req.method === 'GET') return sendJson(res, 200, { ok: true, pantallas: clients.size });
    next();
  };

  return {
    name: 'hive-relay',
    configureServer(server) { server.middlewares.use((req, res, next) => { void handler(req, res, next); }); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => { void handler(req, res, next); }); },
  };
}
