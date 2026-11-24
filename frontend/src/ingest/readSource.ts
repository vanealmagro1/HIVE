// Fuentes de lecturas. HOY solo existe la fuente SIMULADA; la interfaz es la misma que usarán los equipos reales:
//
//   SimulatedRfidSource  → reproduce un escenario determinista (horas y EPC fijos).
//   RfidGatewaySource    → (futuro) portal fijo del andén y lector de mano RFID vía su servicio de eventos
//                          (p. ej. WebSocket/MQTT del lector) → normaliza a InventoryEvent.
//   BeaconSource         → (futuro) gateway BLE con beacons de ubicación → InventoryEvent con channel 'BLE_BEACON'.
//
// Todas entregan InventoryEvent a `onRead`, que la app envía a demoApi.postEvent (ingesta única).
import type { InventoryEvent, ReadChannel } from '../domain/types';

export interface ReadSource {
  readonly id: string;
  readonly channel: ReadChannel;
  /** Comienza a emitir lecturas. `onDone` se llama al terminar (fuentes finitas, como un escenario). */
  start(onRead: (event: InventoryEvent) => void, onDone?: () => void): void;
  stop(): void;
  readonly running: boolean;
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const browserTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Reproduce lecturas de un escenario con un ritmo fijo (solo para visualizar; el orden es determinista). */
export class SimulatedRfidSource implements ReadSource {
  readonly channel: ReadChannel;
  private handle: unknown = null;
  private index = 0;
  running = false;

  constructor(
    readonly id: string,
    private readonly events: InventoryEvent[],
    private readonly intervalMs = 380,
    private readonly timers: Timers = browserTimers,
  ) {
    this.channel = events[0]?.channel ?? 'RFID_PORTAL';
  }

  start(onRead: (event: InventoryEvent) => void, onDone?: () => void): void {
    this.stop();
    this.index = 0;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      if (this.index >= this.events.length) { this.running = false; this.handle = null; onDone?.(); return; }
      onRead(this.events[this.index]);
      this.index += 1;
      this.handle = this.timers.setTimeout(tick, this.intervalMs);
    };
    this.handle = this.timers.setTimeout(tick, this.intervalMs);
  }

  stop(): void {
    if (this.handle !== null) this.timers.clearTimeout(this.handle);
    this.handle = null;
    this.running = false;
  }
}
