// Series para las gráficas de analítica, derivadas SOLO del estado (despachos, recepciones, traslados y stock actual).
//   Demanda histórica  = despachos diarios a clientes de la ventana (días sin despacho = 0).
//   Demanda proyectada = promedio de la ventana (mismo método que la cobertura), horizonte de 30 días.
//   Banda              = ± 1 desviación estándar de los despachos diarios observados (variabilidad, NO probabilidad).
//                        Solo se muestra si hay pronóstico y la serie varía (σ > 0).
//   Stock histórico    = reconstrucción hacia atrás desde el stock actual:
//                        stock(fin del día d−1) = stock(fin del día d) + salidas(d) − entradas(d).
//   Stock proyectado   = stock actual − demanda diaria × días (sin reposiciones supuestas), mínimo 0.
//   Stock objetivo     = demanda diaria × cobertura objetivo.
import { addDays, daysBetween } from '../domain/dates';
import type { DemoState } from '../store/demoState';
import { computeAnalytics } from '../store/demoState';
import type { SkuAnalytics } from './analytics';

export const PROJECTION_DAYS = 30;

export interface DemandPoint { date: string; units: number }
export interface ProjectionPoint { date: string; units: number; low: number | null; high: number | null }
export interface DemandSeries {
  skuId: string;
  history: DemandPoint[];
  projection: ProjectionPoint[];
  mean: number | null;
  stdDev: number | null;
  bandAvailable: boolean;
}

export interface StockPoint { date: string; stock: number; inflow: number; outflow: number; transferOut: number }
export interface StockSeries {
  skuId: string;
  history: StockPoint[];
  projection: { date: string; stock: number }[];
  targetStock: number | null;
  /** Salidas por traslado interno dentro del periodo (no son demanda). */
  transfers: { date: string; units: number; note: string }[];
}

const windowDates = (ref: string, days: number) => Array.from({ length: days }, (_, i) => addDays(ref, -(days - i)));

export function demandSeries(state: DemoState, skuId: string, analytics?: SkuAnalytics): DemandSeries {
  const a = analytics ?? computeAnalytics(state).find((x) => x.skuId === skuId);
  const windowDays = a?.windowDays ?? 30;
  const byDate = new Map<string, number>();
  for (const d of state.dailyDemand) if (d.skuId === skuId) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.dispatchedBaseUnits);
  const history = windowDates(state.referenceDate, windowDays).map((date) => ({ date, units: byDate.get(date) ?? 0 }));
  if (!a?.forecastAvailable || a.dailyDemand === null) {
    return { skuId, history, projection: [], mean: null, stdDev: null, bandAvailable: false };
  }
  const mean = a.dailyDemand;
  const variance = history.reduce((t, p) => t + (p.units - mean) ** 2, 0) / Math.max(1, history.length - 1);
  const stdDev = Math.sqrt(variance);
  const bandAvailable = stdDev > 0;
  const projection = Array.from({ length: PROJECTION_DAYS }, (_, i) => ({
    date: addDays(state.referenceDate, i),
    units: mean,
    low: bandAvailable ? Math.max(0, mean - stdDev) : null,
    high: bandAvailable ? mean + stdDev : null,
  }));
  return { skuId, history, projection, mean, stdDev, bandAvailable };
}

/** Unidades recibidas por SKU y fecha a partir de las órdenes de compra cerradas o en recepción. */
function receiptsByDate(state: DemoState, skuId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const po of state.purchaseOrders) {
    if (po.skuId !== skuId || po.receivedBoxIds.length === 0) continue;
    const date = (po.closedAt ?? state.referenceDate).slice(0, 10);
    const qty = po.boxes.filter((b) => po.receivedBoxIds.includes(b.boxId)).reduce((t, b) => t + b.qty, 0);
    out.set(date, (out.get(date) ?? 0) + qty);
  }
  return out;
}

export function stockSeries(state: DemoState, skuId: string, analytics?: SkuAnalytics): StockSeries {
  const a = analytics ?? computeAnalytics(state).find((x) => x.skuId === skuId);
  const windowDays = a?.windowDays ?? 30;
  const ref = state.referenceDate;
  const dispatch = new Map<string, number>();
  for (const d of state.dailyDemand) if (d.skuId === skuId) dispatch.set(d.date, (dispatch.get(d.date) ?? 0) + d.dispatchedBaseUnits);
  const transferOut = new Map<string, number>();
  const transfers: StockSeries['transfers'] = [];
  for (const t of state.internalTransfers) {
    if (t.skuId !== skuId) continue;
    const age = daysBetween(t.date, ref);
    if (age < 0 || age > windowDays) continue;
    transferOut.set(t.date, (transferOut.get(t.date) ?? 0) + t.baseUnits);
    transfers.push({ date: t.date, units: t.baseUnits, note: t.note });
  }
  const receipts = receiptsByDate(state, skuId);
  // Fechas: del inicio de la ventana hasta hoy (incluido). Hoy = stock actual.
  const dates = [...windowDates(ref, windowDays), ref];
  const history: StockPoint[] = new Array(dates.length);
  let stock = a?.stock ?? 0;
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const date = dates[i];
    const outflow = dispatch.get(date) ?? 0;
    const tOut = transferOut.get(date) ?? 0;
    const inflow = receipts.get(date) ?? 0;
    history[i] = { date, stock, inflow, outflow, transferOut: tOut };
    stock = stock + outflow + tOut - inflow; // estado al cierre del día anterior
  }
  const daily = a?.forecastAvailable ? a.dailyDemand : null;
  const current = a?.stock ?? 0;
  const projection = daily === null ? [] : Array.from({ length: PROJECTION_DAYS + 1 }, (_, i) => ({
    date: addDays(ref, i), stock: Math.max(0, current - daily * i),
  }));
  return {
    skuId,
    history,
    projection,
    targetStock: daily === null ? null : daily * (a?.targetCoverageDays ?? 30),
    transfers,
  };
}
