// Protocolo del relé de lecturas en vivo, compartido por el relé local (vite/hiveRelay.ts) y el Worker de
// Cloudflare (worker/index.ts). Sin dependencias de Node ni del navegador.

export interface RelayRead {
  id: string;
  beacon: string;
  ubicacion: string;
  rssi: number | null;
  lector: string;
  t: number;
}

/** Valida y normaliza una lectura recibida. Devuelve el texto del error si no es válida. */
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

/** Trama SSE de una lectura. */
export const sseFrame = (read: RelayRead) => `data: ${JSON.stringify(read)}\n\n`;

export const MAX_BODY = 4096;
