// Analítica predictiva INICIAL y explicable (no es ML entrenado). Datos SINTÉTICOS.
// Fórmulas (PLAN_MAESTRO §6):
//   dailyDemand      = sum(despachos últimos N días) / N            (N = 30; transferencias excluidas)
//   coverageDays     = stock / dailyDemand                            (solo si dailyDemand > 0)
//   excess           = max(0, stock - dailyDemand * targetDays)
//   exposureUsd      = excess * unitCost
//   remainingAtExpiry= max(0, stock - dailyDemand * daysUntilExpiry)  (solo con caducidad y demanda > 0; FEFO por lote)
//   stagnant         = daysSinceLastDispatch > 60                     (REGLA, no predicción)
import { DEMAND_WINDOW_DAYS, STAGNANT_THRESHOLD_DAYS } from '../domain/constants';
import { daysBetween } from '../domain/dates';
import type { DailyDemand, ISODate, Lot, SKU } from '../domain/types';

/** Mínimo de días con despachos dentro de la ventana para emitir un pronóstico. */
export const MIN_DAYS_WITH_DISPATCH = 7;

export type DataCoverage = 'ALTA' | 'MEDIA' | 'BAJA' | 'INSUFICIENTE';

export interface LotExpiryRisk {
  lotId: string;
  expiryDate: ISODate;
  daysUntilExpiry: number;
  lotStock: number;
  remainingAtExpiry: number;
  exposureUsd: number;
}

export interface SkuAnalytics {
  skuId: string;
  skuName: string;
  unitCost: number;
  hasExpiry: boolean;
  stock: number;
  referenceDate: ISODate;
  windowDays: number;
  dispatchedInWindow: number;
  daysWithDispatch: number;
  dataCoverage: DataCoverage;
  forecastAvailable: boolean;
  insufficientDataMessage: string | null;
  dailyDemand: number | null;
  coverageDays: number | null;
  targetCoverageDays: number;
  excessUnits: number | null;
  excessExposureUsd: number | null;
  expiryRisks: LotExpiryRisk[];
  expiryRemainingUnits: number | null;
  expiryExposureUsd: number | null;
  lastDispatchDate: ISODate | null;
  daysSinceLastDispatch: number | null;
  stagnantByRule: boolean;
  stagnantValueUsd: number | null;
  assumptions: string[];
  limitations: string[];
}

export interface SkuAnalyticsInput {
  sku: SKU;
  lots: Lot[]; // lotes del SKU
  stockByLot: Map<string, number>;
  demand: DailyDemand[]; // solo despachos
  targetCoverageDays: number;
  referenceDate: ISODate;
  windowDays?: number;
}

function coverageLabel(daysWithDispatch: number, windowDays: number): DataCoverage {
  if (daysWithDispatch < MIN_DAYS_WITH_DISPATCH) return 'INSUFICIENTE';
  const ratio = daysWithDispatch / windowDays;
  if (ratio >= 0.8) return 'ALTA';
  if (ratio >= 0.5) return 'MEDIA';
  return 'BAJA';
}

export function computeSkuAnalytics(input: SkuAnalyticsInput): SkuAnalytics {
  const { sku, referenceDate, targetCoverageDays } = input;
  const windowDays = input.windowDays ?? DEMAND_WINDOW_DAYS;
  const skuLots = input.lots.filter((l) => l.skuId === sku.id);
  const stock = skuLots.reduce((s, l) => s + (input.stockByLot.get(l.id) ?? 0), 0);

  const skuDemand = input.demand.filter((d) => d.skuId === sku.id && d.dispatchedBaseUnits > 0);
  // Ventana: los N días calendario previos a la fecha de referencia (excluye la propia fecha y futuros).
  const inWindow = skuDemand.filter((d) => {
    const age = daysBetween(d.date, referenceDate);
    return age >= 1 && age <= windowDays;
  });
  const dispatchedInWindow = inWindow.reduce((s, d) => s + d.dispatchedBaseUnits, 0);
  const daysWithDispatch = new Set(inWindow.map((d) => d.date)).size;
  const dataCoverage = coverageLabel(daysWithDispatch, windowDays);
  const forecastAvailable = dataCoverage !== 'INSUFICIENTE' && dispatchedInWindow > 0;

  const past = skuDemand.filter((d) => daysBetween(d.date, referenceDate) >= 1);
  const lastDispatchDate = past.length ? past.map((d) => d.date).sort().at(-1)! : null;
  const daysSinceLastDispatch = lastDispatchDate ? daysBetween(lastDispatchDate, referenceDate) : null;
  // Sin ningún despacho registrado no se puede evaluar la regla de inmovilizado.
  const stagnantByRule = daysSinceLastDispatch !== null && daysSinceLastDispatch > STAGNANT_THRESHOLD_DAYS;

  let dailyDemand: number | null = null;
  let coverageDays: number | null = null;
  let excessUnits: number | null = null;
  let excessExposureUsd: number | null = null;
  const expiryRisks: LotExpiryRisk[] = [];
  let expiryRemainingUnits: number | null = null;
  let expiryExposureUsd: number | null = null;

  if (forecastAvailable) {
    dailyDemand = dispatchedInWindow / windowDays;
    coverageDays = stock / dailyDemand;
    excessUnits = Math.max(0, stock - dailyDemand * targetCoverageDays);
    excessExposureUsd = excessUnits * sku.unitCost;

    if (sku.hasExpiry) {
      // FEFO: el consumo previsto se asigna primero a los lotes que vencen antes.
      const expiring = skuLots
        .filter((l): l is Lot & { expiryDate: ISODate } => l.expiryDate !== null)
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      let consumedByEarlierLots = 0;
      for (const lot of expiring) {
        const lotStock = input.stockByLot.get(lot.id) ?? 0;
        const daysUntilExpiry = daysBetween(referenceDate, lot.expiryDate);
        const consumableBeforeExpiry = dailyDemand * Math.max(0, daysUntilExpiry);
        const consumedFromLot = Math.min(lotStock, Math.max(0, consumableBeforeExpiry - consumedByEarlierLots));
        consumedByEarlierLots += consumedFromLot;
        const remainingAtExpiry = lotStock - consumedFromLot;
        expiryRisks.push({
          lotId: lot.id,
          expiryDate: lot.expiryDate,
          daysUntilExpiry,
          lotStock,
          remainingAtExpiry,
          exposureUsd: remainingAtExpiry * sku.unitCost,
        });
      }
      expiryRemainingUnits = expiryRisks.reduce((s, r) => s + r.remainingAtExpiry, 0);
      expiryExposureUsd = expiryRemainingUnits * sku.unitCost;
    }
  }

  const assumptions = [
    `Datos SINTÉTICOS; fecha de cálculo fija ${referenceDate}.`,
    `Demanda = despachos de los últimos ${windowDays} días / ${windowDays}; transferencias internas excluidas.`,
    `Stock = suma de unidades hoja (cajas); el pallet no se suma de nuevo.`,
    `Cobertura objetivo: ${targetCoverageDays} días (umbral fijo de la demo).`,
    `Costo unitario USD ${sku.unitCost}; valor en riesgo = unidades × costo.`,
  ];
  if (sku.hasExpiry) assumptions.push('Consumo futuro igual al promedio histórico y asignado FEFO por lote.');
  const limitations = [
    'Estimación determinista, no modelo estadístico ni ML; sin intervalos de probabilidad.',
    'Impacto estimado, no ahorro realizado ni pérdida confirmada.',
  ];

  return {
    skuId: sku.id,
    skuName: sku.name,
    unitCost: sku.unitCost,
    hasExpiry: sku.hasExpiry,
    stock,
    referenceDate,
    windowDays,
    dispatchedInWindow,
    daysWithDispatch,
    dataCoverage,
    forecastAvailable,
    insufficientDataMessage: forecastAvailable ? null : 'Sin datos suficientes para pronosticar',
    dailyDemand,
    coverageDays,
    targetCoverageDays,
    excessUnits,
    excessExposureUsd,
    expiryRisks,
    expiryRemainingUnits,
    expiryExposureUsd,
    lastDispatchDate,
    daysSinceLastDispatch,
    stagnantByRule,
    stagnantValueUsd: stagnantByRule ? stock * sku.unitCost : null,
    assumptions,
    limitations,
  };
}
