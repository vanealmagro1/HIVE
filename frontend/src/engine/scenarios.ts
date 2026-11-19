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
    title: 'Lectura en ubicación distinta',
    description: 'El lector RFID detecta PAL-001 (mochilas) en el pasillo 4, aunque está registrado en el pasillo 2.',
    events: [{
      id: 'evt-demo-001',
      scenarioId: 'DEMO_MOVE_001',
      source: 'SIMULATED',
      capturedAt: '2026-11-19T09:15:00Z',
      receivedAt: '2026-11-19T09:15:02Z',
      unitId: 'PAL-001',
      type: 'OBSERVATION',
      locationHintId: 'P4-D02-N2',
      evidenceNote: 'Lectura RFID SIMULADA de la etiqueta del pallet asociada a P4-D02-N2 (Zona B, pasillo 4). No es una lectura real ni confirma la posición exacta.',
    }],
  },
  {
    id: 'DEMO_MISSING_001',
    title: 'Ausencia de lectura',
    description: 'PAL-007 (calculadoras) no responde en el recorrido simulado del pasillo 6.',
    events: [{
      id: 'evt-demo-002',
      scenarioId: 'DEMO_MISSING_001',
      source: 'SIMULATED',
      capturedAt: '2026-11-19T09:20:00Z',
      receivedAt: '2026-11-19T09:20:01Z',
      unitId: 'PAL-007',
      type: 'MISSED_READ',
      locationHintId: null,
      evidenceNote: 'Recorrido RFID SIMULADO del pasillo 6 sin lectura de PAL-007. La ausencia de lectura no implica pérdida.',
    }],
  },
];

export const DEMO_SCENARIO_ID = 'DEMO_MOVE_001';

export function getScenario(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Escenario desconocido: ${id}`);
  return s;
}
