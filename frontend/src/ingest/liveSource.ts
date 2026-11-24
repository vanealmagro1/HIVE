// Lecturas EN VIVO de beacons (celular = lector de mano, o escáner de la laptop) a través del relé local
// (frontend/vite/hiveRelay.ts, Server-Sent Events). Cada lectura se convierte en un InventoryEvent y entra por
// la misma ingesta única que las lecturas simuladas (demoApi.postEvent → idempotente, conciliación, alertas).
import type { InventoryEvent } from '../domain/types';
import { BEACON_BOXES } from '../seed/seed';
import type { ReadSource } from './readSource';

/** Forma de una lectura publicada por el relé. */
export interface LiveRead {
  id: string;
  beacon: string;
  ubicacion: string;
  rssi: number | null;
  lector: string;
  t: number;
}

export const LIVE_SCENARIO_ID = 'LIVE_BLE';
export type LiveStatus = 'off' | 'connecting' | 'connected' | 'offline';

export const beaconBox = (label: string) => BEACON_BOXES.find((b) => b.label === label) ?? null;

/** "2026-11-19T15:06:42Z": fecha de referencia de la demo + hora del día real (coherente con el resto de datos). */
export function demoTimestamp(referenceDate: string, t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${referenceDate}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}Z`;
}

/** Traduce una lectura del relé a un evento de inventario. null si el beacon no está asignado a ninguna caja. */
export function liveReadToEvent(read: LiveRead, referenceDate: string): InventoryEvent | null {
  const box = beaconBox(read.beacon);
  if (!box) return null;
  const at = demoTimestamp(referenceDate, read.t);
  const reader = read.lector === 'laptop' ? 'Escáner de la laptop' : 'Celular (lector de mano)';
  return {
    id: `ble-${read.id}`,
    scenarioId: LIVE_SCENARIO_ID,
    source: 'BLE',
    channel: 'BLE_BEACON',
    capturedAt: at,
    receivedAt: at,
    unitId: box.unitId,
    type: 'OBSERVATION',
    locationHintId: read.ubicacion,
    readerId: read.lector,
    rssi: read.rssi ?? undefined,
    evidenceNote: `Beacon ${read.beacon} leído por ${reader} en ${read.ubicacion}${read.rssi !== null ? ` (${read.rssi} dBm)` : ''}.`,
  };
}

/** Fuente continua: escucha el relé y entrega cada lectura como InventoryEvent. Reconecta sola (EventSource). */
export class LiveBeaconSource implements ReadSource {
  readonly channel = 'BLE_BEACON' as const;
  private es: EventSource | null = null;
  running = false;

  constructor(
    readonly id: string,
    private readonly url: string,
    private readonly referenceDate: string,
    private readonly onStatus: (status: LiveStatus) => void,
  ) {}

  start(onRead: (event: InventoryEvent) => void): void {
    this.stop();
    if (typeof EventSource === 'undefined') { this.onStatus('off'); return; }
    this.running = true;
    this.onStatus('connecting');
    const es = new EventSource(this.url);
    this.es = es;
    es.onopen = () => this.onStatus('connected');
    es.onerror = () => this.onStatus(es.readyState === EventSource.CLOSED ? 'off' : 'offline');
    es.onmessage = (msg) => {
      try {
        const ev = liveReadToEvent(JSON.parse(msg.data) as LiveRead, this.referenceDate);
        if (ev) onRead(ev);
      } catch { /* lectura mal formada: se ignora */ }
    };
  }

  stop(): void {
    this.es?.close();
    this.es = null;
    this.running = false;
  }
}
