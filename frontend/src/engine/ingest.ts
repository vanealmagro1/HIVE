// Punto ÚNICO de ingesta de lecturas: portal del andén, lector de mano y (a futuro) beacons BLE.
// Toda fuente — simulada hoy, real mañana — termina aquí (vía demoApi.postEvent), de modo que la
// conciliación, la idempotencia y la auditoría no dependen del hardware.
import type { InventoryEvent } from '../domain/types';
import type { DemoState } from '../store/demoState';
import { processEvent, type ProcessResult } from './eventProcessor';
import { processReceiptRead } from './receiving';

export function ingestEvent(state: DemoState, event: InventoryEvent): ProcessResult {
  return event.type === 'RECEIPT_READ' ? processReceiptRead(state, event) : processEvent(state, event);
}
