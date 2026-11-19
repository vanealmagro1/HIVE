// Escenarios deterministas del simulador. Fuente SIEMPRE 'SIMULATED' y horas fijas (no se usa el reloj).
import type { InventoryEvent } from '../domain/types';

export interface Scenario {
  id: string;
  title: string;
  description: string;
  events: InventoryEvent[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'DEMO_MOVE_001',
    title: 'Observación en ubicación distinta',
    description: 'PAL-001 se observa en LOC-B2 aunque el registro lo espera en LOC-A1.',
    events: [{
      id: 'evt-demo-001',
      scenarioId: 'DEMO_MOVE_001',
      source: 'SIMULATED',
      capturedAt: '2026-11-19T09:15:00Z',
      receivedAt: '2026-11-19T09:15:02Z',
      unitId: 'PAL-001',
      type: 'OBSERVATION',
      locationHintId: 'LOC-B2',
      evidenceNote: 'Lectura SIMULADA de la etiqueta del pallet asociada a LOC-B2 (Zona B). No es una lectura RFID/BLE real ni confirma la posición exacta.',
    }],
  },
  {
    id: 'DEMO_MISSING_001',
    title: 'Ausencia de lectura',
    description: 'PAL-007 no se lee en el recorrido simulado de la Zona C.',
    events: [{
      id: 'evt-demo-002',
      scenarioId: 'DEMO_MISSING_001',
      source: 'SIMULATED',
      capturedAt: '2026-11-19T09:20:00Z',
      receivedAt: '2026-11-19T09:20:01Z',
      unitId: 'PAL-007',
      type: 'MISSED_READ',
      locationHintId: null,
      evidenceNote: 'Recorrido SIMULADO de la Zona C sin lectura de PAL-007. La ausencia de lectura no implica pérdida.',
    }],
  },
];

export const DEMO_SCENARIO_ID = 'DEMO_MOVE_001';

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Escenario desconocido: ${id}`);
  return s;
}
