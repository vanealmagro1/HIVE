// Estado único de la demo (única fuente de verdad para 3D, inventario, alertas y analítica).
import { computeSkuAnalytics, type SkuAnalytics } from '../analytics/analytics';
import { buildAnalyticsRecommendations } from '../analytics/recommendations';
import { REFERENCE_DATE } from '../domain/constants';
import { stockByLot, stockBySku } from '../domain/inventory';
import type {
  Alert, Discrepancy, InventoryEvent, Movement, Recommendation, SeedData, Task,
} from '../domain/types';
import { createSeed } from '../seed/seed';
import type { LiveStatus } from '../ingest/liveSource';

export type View = 'twin' | 'rfid' | 'inventory' | 'alerts' | 'analytics' | 'measure';
/** Secciones de la navegación lateral. */
export type Section = 'dashboard' | 'gemelo' | 'inventario' | 'eventos' | 'analitica' | 'acciones';

export interface AuditEntry { seq: number; message: string }

export interface DemoState extends SeedData {
  environment: 'SIMULATION';
  referenceDate: string;
  events: InventoryEvent[];
  discrepancies: Discrepancy[];
  alerts: Alert[];
  recommendations: Recommendation[];
  tasks: Task[];
  /** Traslados internos generados al aprobar una redistribución (ejecución simulada). */
  movements: Movement[];
  audit: AuditEntry[];
  /** playback: escenario cuyas lecturas se están reproduciendo en vivo (solo visualización). */
  /** skuId: producto en foco, compartido por gemelo, gráficas, indicadores y recomendaciones. */
  ui: { selectedUnitId: string | null; view: View; force2D: boolean; playback: string | null; section: Section; skuId: string | null; focusSeq: number; live: LiveStatus };
  /** Último resultado de una acción, para mostrar retroalimentación (p. ej. evento duplicado). */
  lastMessage: { kind: 'info' | 'warning' | 'error'; text: string } | null;
}

type AnalyticsInput = Pick<DemoState, 'skus' | 'lots' | 'units' | 'dailyDemand' | 'policies' | 'referenceDate'>;
let cache: { key: unknown[]; value: SkuAnalytics[] } | null = null;

/** Analítica de todos los SKU. Memoizada por identidad de entradas (el estado es inmutable). */
export function computeAnalytics(state: AnalyticsInput): SkuAnalytics[] {
  const key = [state.skus, state.lots, state.units, state.dailyDemand, state.policies, state.referenceDate];
  if (cache && cache.key.every((k, i) => k === key[i])) return cache.value;
  const byLot = stockByLot(state.units);
  const lotsBySku = new Map<string, typeof state.lots>();
  for (const l of state.lots) lotsBySku.set(l.skuId, [...(lotsBySku.get(l.skuId) ?? []), l]);
  const demandBySku = new Map<string, typeof state.dailyDemand>();
  for (const d of state.dailyDemand) demandBySku.set(d.skuId, [...(demandBySku.get(d.skuId) ?? []), d]);
  const value = state.skus.map((sku) => computeSkuAnalytics({
    sku,
    lots: lotsBySku.get(sku.id) ?? [],
    stockByLot: byLot,
    demand: demandBySku.get(sku.id) ?? [],
    targetCoverageDays: state.policies.find((p) => p.skuId === sku.id)?.targetCoverageDays ?? 30,
    referenceDate: state.referenceDate,
  }));
  cache = { key, value };
  return value;
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
    movements: [],
    audit: [{ seq: 1, message: 'Estado semilla cargado (datos sintéticos, fecha de referencia 2026-11-19).' }],
    ui: { selectedUnitId: null, view: 'twin', force2D: false, playback: null, section: 'dashboard', skuId: null, focusSeq: 0, live: 'off' },
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
