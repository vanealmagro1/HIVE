// Estado único de la demo (única fuente de verdad para 3D, inventario, alertas y analítica).
import { computeSkuAnalytics, type SkuAnalytics } from '../analytics/analytics';
import { buildAnalyticsRecommendations } from '../analytics/recommendations';
import { REFERENCE_DATE } from '../domain/constants';
import { stockByLot, stockBySku } from '../domain/inventory';
import type {
  Alert, Discrepancy, InventoryEvent, Recommendation, SeedData, Task,
} from '../domain/types';
import { createSeed } from '../seed/seed';

export type View = 'twin' | 'inventory' | 'alerts' | 'analytics';

export interface AuditEntry { seq: number; message: string }

export interface DemoState extends SeedData {
  environment: 'SIMULATION';
  referenceDate: string;
  events: InventoryEvent[];
  discrepancies: Discrepancy[];
  alerts: Alert[];
  recommendations: Recommendation[];
  tasks: Task[];
  audit: AuditEntry[];
  ui: { selectedUnitId: string | null; view: View; force2D: boolean };
  /** Último resultado de una acción, para mostrar retroalimentación (p. ej. evento duplicado). */
  lastMessage: { kind: 'info' | 'warning' | 'error'; text: string } | null;
}

export function computeAnalytics(state: Pick<DemoState, 'skus' | 'lots' | 'units' | 'dailyDemand' | 'policies' | 'referenceDate'>): SkuAnalytics[] {
  const byLot = stockByLot(state.units);
  return state.skus.map((sku) => computeSkuAnalytics({
    sku,
    lots: state.lots,
    stockByLot: byLot,
    demand: state.dailyDemand,
    targetCoverageDays: state.policies.find((p) => p.skuId === sku.id)?.targetCoverageDays ?? 30,
    referenceDate: state.referenceDate,
  }));
}

export function createInitialState(): DemoState {
  const seed = createSeed();
  const base = { ...seed, referenceDate: REFERENCE_DATE };
  return {
    ...base,
    environment: 'SIMULATION',
    events: [],
    discrepancies: [],
    alerts: [],
    recommendations: buildAnalyticsRecommendations(computeAnalytics(base)),
    tasks: [],
    audit: [{ seq: 1, message: 'Estado semilla cargado (datos sintéticos, fecha de referencia 2026-11-19).' }],
    ui: { selectedUnitId: null, view: 'twin', force2D: false },
    lastMessage: null,
  };
}

export function appendAudit(state: DemoState, message: string): AuditEntry[] {
  const seq = (state.audit.at(-1)?.seq ?? 0) + 1;
  return [...state.audit, { seq, message }];
}

export function inventoryTotals(state: DemoState): Map<string, number> {
  return stockBySku(state.units, state.lots);
}
