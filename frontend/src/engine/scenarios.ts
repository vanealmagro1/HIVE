// Escenarios deterministas del simulador. Fuente SIEMPRE 'SIMULATED' y horas fijas (no se usa el reloj).
import type { InventoryEvent } from '../domain/types';
import { createSeed, DEMO_PO_ID, DEMO_PO_MISSING_BOX } from '../seed/seed';

/** Recepción OC-2026-1187 por el portal del andén: se leen 11 de 12 cajas; 3 etiquetas las lee también la antena 2. */
function receptionReads(): InventoryEvent[] {
  const po = createSeed().purchaseOrders.find((p) => p.id === DEMO_PO_ID)!;
  const reads: { boxId: string; epc: string; antenna: number }[] = [];
  for (const b of po.boxes) {
    if (b.boxId === DEMO_PO_MISSING_BOX) continue; // el proveedor no la despachó
    reads.push({ ...b, antenna: 1 });
    if (['BOX-901-03', 'BOX-901-07', 'BOX-901-10'].includes(b.boxId)) reads.push({ ...b, antenna: 2 });
  }
  return reads.map((r, i) => {
    const sec = 2 + i;
    const t = (s: number) => `2026-11-19T08:02:${String(s).padStart(2, '0')}Z`;
    return {
      id: `evt-rx-1187-${String(i + 1).padStart(2, '0')}`,
      scenarioId: 'DEMO_RECEIPT_001',
      source: 'SIMULATED',
      capturedAt: t(sec),
      receivedAt: t(sec + 1),
      unitId: r.boxId,
      type: 'RECEIPT_READ',
      locationHintId: po.dockLocationId,
      evidenceNote: `Lectura RFID SIMULADA del portal del andén (antena ${r.antenna}) para ${po.id}.`,
      channel: 'RFID_PORTAL',
      readerId: 'PORTAL-ANDEN-1',
      antenna: r.antenna,
      epc: r.epc,
      rssi: -48 - ((i * 7) % 15),
      purchaseOrderId: po.id,
    } satisfies InventoryEvent;
  });
}

export const RECEIPT_CLOSE_TIME = '2026-11-19T08:03:00Z';

/** Lectura clave del guion: el lector de mano detecta PAL-001 (registrado en P2) en el pasillo 4. */
const DEMO_MOVE_EVENT: InventoryEvent = {
  id: 'evt-demo-001',
  scenarioId: 'DEMO_MOVE_001',
  source: 'SIMULATED',
  capturedAt: '2026-11-19T09:15:00Z',
  receivedAt: '2026-11-19T09:15:02Z',
  unitId: 'PAL-001',
  type: 'OBSERVATION',
  locationHintId: 'P4-D02-N2',
  evidenceNote: 'Lectura RFID SIMULADA del lector de mano asociada a P4-D02-N2 (Zona B, pasillo 4). No es una lectura real ni confirma la posición exacta.',
  channel: 'RFID_HANDHELD',
  readerId: 'LECTOR-MANO-01',
  rssi: -61,
};

/**
 * Conteo cíclico del pasillo P4 con lector de mano: el operario recorre de la bahía 5 (frente) a la 1 y lee
 * cada etiqueta. Todas responden en su ubicación salvo una sorpresa: PAL-001, registrado en el pasillo 2.
 */
function aisleCountReads(): InventoryEvent[] {
  const seed = createSeed();
  const roots = seed.units.filter((u) => !u.parentId && u.expectedLocationId.startsWith('P4-'));
  const bay = (loc: string) => Number(loc.slice(4, 6));
  roots.sort((a, b) => bay(b.expectedLocationId) - bay(a.expectedLocationId) || a.expectedLocationId.localeCompare(b.expectedLocationId));
  const at = roots.findIndex((u) => bay(u.expectedLocationId) < 2);
  const ordered: (InventoryEvent | (typeof roots)[number])[] = [...roots];
  ordered.splice(at < 0 ? ordered.length : at, 0, DEMO_MOVE_EVENT);
  const keyIndex = ordered.indexOf(DEMO_MOVE_EVENT);
  const base = Date.parse(DEMO_MOVE_EVENT.capturedAt);
  const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
  return ordered.map((u, i) => {
    if (u === DEMO_MOVE_EVENT) return DEMO_MOVE_EVENT;
    const unit = u as (typeof roots)[number];
    const t = base + (i - keyIndex) * 2000;
    return {
      id: `evt-hh-p4-${String(i + 1).padStart(2, '0')}`,
      scenarioId: 'DEMO_COUNT_P4',
      source: 'SIMULATED',
      capturedAt: iso(t),
      receivedAt: iso(t + 1000),
      unitId: unit.id,
      type: 'OBSERVATION',
      locationHintId: unit.expectedLocationId,
      evidenceNote: 'Lectura RFID SIMULADA del lector de mano durante el conteo cíclico del pasillo 4.',
      channel: 'RFID_HANDHELD',
      readerId: 'LECTOR-MANO-01',
      rssi: -52 - ((i * 5) % 18),
    } satisfies InventoryEvent;
  });
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  events: InventoryEvent[];
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'DEMO_RECEIPT_001',
    title: 'Recepción RFID de la OC-2026-1187',
    description: 'El camión del proveedor pasa por el portal del andén: se leen 11 de las 12 cajas anunciadas.',
    events: receptionReads(),
  },
  {
    id: 'DEMO_COUNT_P4',
    title: 'Conteo del pasillo 4 con lector de mano',
    description: 'Un operario recorre el pasillo 4 con el lector de mano RFID: todo responde en su lugar salvo PAL-001.',
    events: aisleCountReads(),
  },
  {
    id: 'DEMO_MOVE_001',
    title: 'Lectura en ubicación distinta',
    description: 'El lector RFID detecta PAL-001 (mochilas) en el pasillo 4, aunque está registrado en el pasillo 2.',
    events: [DEMO_MOVE_EVENT],
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
