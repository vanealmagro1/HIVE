// Semáforo de antigüedad: cuánto tiempo lleva cada unidad logística en la bodega.
//   Verde  0–90 días     rota bien
//   Ámbar  91–180 días   se está estancando
//   Rojo   > 180 días    inventario hueso (crítico desde 330 días, umbral validado con retail)
// La pérdida estimada aplica un supuesto validado en entrevista: del inventario con más de 330 días se pierde ~60 %.
import { daysBetween } from '../domain/dates';
import { formatNumber, formatUsd } from '../domain/format';
import type { LogisticUnit, Recommendation } from '../domain/types';
import { availablePallets, transferCandidates } from '../engine/transfers';
import type { DemoState } from '../store/demoState';
import { unitContents } from '../store/selectors';

export type AgingKey = 'verde' | 'ambar' | 'rojo';
export interface AgingBand { key: AgingKey; label: string; short: string; hint: string; tone: 'ok' | 'warn' | 'bad'; max: number }

export const AGING_BANDS: AgingBand[] = [
  { key: 'verde', label: 'Rota bien', short: 'Verde', hint: 'Menos de 90 días en bodega', tone: 'ok', max: 90 },
  { key: 'ambar', label: 'Atención', short: 'Ámbar', hint: 'Entre 91 y 180 días: se está estancando', tone: 'warn', max: 180 },
  { key: 'rojo', label: 'Inventario hueso', short: 'Rojo', hint: 'Más de 180 días sin moverse', tone: 'bad', max: Infinity },
];
export const CRITICAL_DAYS = 330;
/** Supuesto de la validación (retail, Ecuador): del inventario > 330 días se pierde ~60 % de su valor. */
export const LOSS_RATE = 0.6;
/** Por debajo de este valor en riesgo, gestionar la acción cuesta más de lo que se recupera. */
export const MIN_AGED_USD = 150;

export function agingBand(days: number): AgingBand {
  return AGING_BANDS.find((b) => days <= b.max)!;
}

export function ageDays(unit: Pick<LogisticUnit, 'receivedAt'>, referenceDate: string): number | null {
  return unit.receivedAt ? Math.max(0, daysBetween(unit.receivedAt, referenceDate)) : null;
}

export interface AgedRow { unit: LogisticUnit; days: number; band: AgingBand; critical: boolean; title: string; skuId: string | null; qty: number; valueUsd: number }

type AgingInput = Pick<DemoState, 'units' | 'lots' | 'skus' | 'referenceDate'>;

/** Unidades logísticas raíz (lo que se ve en Inventario) con su antigüedad y valor. */
export function agedRows(state: AgingInput): AgedRow[] {
  const cost = new Map(state.skus.map((s) => [s.id, s.unitCost]));
  const out: AgedRow[] = [];
  for (const unit of state.units) {
    if (unit.parentId || unit.expectedLocationId.startsWith('REC-')) continue;
    const days = ageDays(unit, state.referenceDate);
    if (days === null) continue;
    const c = unitContents(state, unit);
    const valueUsd = c.lines.reduce((t, l) => t + l.qty * (cost.get(l.skuId) ?? 0), 0);
    out.push({ unit, days, band: agingBand(days), critical: days > CRITICAL_DAYS, title: c.title, skuId: c.skuId, qty: c.qty, valueUsd });
  }
  return out;
}

export interface BandTotals { band: AgingBand; units: number; boxes: number; valueUsd: number; pct: number }
export interface AgingSummary { bands: BandTotals[]; totalValueUsd: number; atRiskUsd: number; estimatedLossUsd: number; critical: number; oldest: AgedRow[] }

export function agingSummary(state: AgingInput): AgingSummary {
  const rows = agedRows(state);
  const totalValueUsd = rows.reduce((t, r) => t + r.valueUsd, 0);
  const bands = AGING_BANDS.map((band) => {
    const rs = rows.filter((r) => r.band.key === band.key);
    const valueUsd = rs.reduce((t, r) => t + r.valueUsd, 0);
    return { band, units: rs.reduce((t, r) => t + r.qty, 0), boxes: rs.length, valueUsd, pct: totalValueUsd ? valueUsd / totalValueUsd : 0 };
  });
  const atRiskUsd = bands[2].valueUsd;
  return {
    bands,
    totalValueUsd,
    atRiskUsd,
    estimatedLossUsd: atRiskUsd * LOSS_RATE,
    critical: rows.filter((r) => r.critical).length,
    oldest: [...rows].sort((a, b) => b.days - a.days || a.unit.id.localeCompare(b.unit.id)).slice(0, 5),
  };
}

export interface SkuAging { skuId: string; name: string; maxDays: number; band: AgingBand; redUnits: number; redValueUsd: number; amberUnits: number; amberValueUsd: number; unitIds: string[] }

/** Antigüedad por SKU (solo unidades de un único SKU; los pallets mixtos se ven en Inventario). */
export function skuAging(state: AgingInput): SkuAging[] {
  const by = new Map<string, SkuAging>();
  for (const r of agedRows(state)) {
    if (!r.skuId) continue;
    const name = state.skus.find((s) => s.id === r.skuId)?.name ?? r.skuId;
    const x = by.get(r.skuId) ?? { skuId: r.skuId, name, maxDays: 0, band: AGING_BANDS[0], redUnits: 0, redValueUsd: 0, amberUnits: 0, amberValueUsd: 0, unitIds: [] };
    x.maxDays = Math.max(x.maxDays, r.days);
    x.band = agingBand(x.maxDays);
    if (r.band.key === 'rojo') { x.redUnits += r.qty; x.redValueUsd += r.valueUsd; }
    if (r.band.key === 'ambar') { x.amberUnits += r.qty; x.amberValueUsd += r.valueUsd; }
    x.unitIds.push(r.unit.id);
    by.set(r.skuId, x);
  }
  return [...by.values()].sort((a, b) => b.maxDays - a.maxDays);
}

/** Recomendaciones del semáforo. Son PROPUESTAS: aprobarlas crea una tarea (y un traslado simulado si aplica). */
export function buildAgingRecommendations(state: DemoState, existing: Recommendation[]): Recommendation[] {
  const covered = new Set(existing.map((r) => r.skuId));
  const assumptions = [
    `Antigüedad = días desde el ingreso a bodega hasta ${state.referenceDate} (datos sintéticos).`,
    `Pérdida estimada: ${Math.round(LOSS_RATE * 100)} % del valor con más de 180 días (supuesto validado con retail: inventario > ${CRITICAL_DAYS} días).`,
  ];
  const out: Recommendation[] = [];
  for (const s of skuAging(state)) {
    if (covered.has(s.skuId)) continue;
    if (s.redUnits > 0 && s.redValueUsd >= MIN_AGED_USD) {
      // ¿Otra bodega lo vende? → se traslada con pallets completos; si no, se liquida.
      const dest = transferCandidates(state, s.skuId)[0];
      const pallets = dest ? availablePallets(state, s.skuId).filter((p) => (ageDays(p, state.referenceDate) ?? 0) > 180) : [];
      let qty = 0;
      for (const p of pallets) if (qty + p.quantityBaseUnits <= (dest?.deficit ?? 0)) qty += p.quantityBaseUnits;
      if (dest && qty > 0) {
        out.push({
          id: `rec-aged-${s.skuId.toLowerCase()}`, type: 'MOVE_AGED',
          title: `Mover ${formatNumber(qty)} u de inventario hueso a ${dest.site.name.replace(' (simulada)', '')}`,
          reason: `${s.name}: lleva ${s.maxDays} días sin rotar aquí, mientras ${dest.site.name.replace(' (simulada)', '')} lo vende `
            + `(${formatNumber(dest.dailyDemand)} u/día) y le faltan ${formatNumber(dest.deficit)} u. Moverlo evita perder ${formatUsd(s.redValueUsd * LOSS_RATE)}.`,
          skuId: s.skuId, unitId: null, estimatedImpactUsd: s.redValueUsd * LOSS_RATE, quantity: qty, status: 'PROPOSED', assumptions,
        });
      } else {
        out.push({
          id: `rec-liq-${s.skuId.toLowerCase()}`, type: 'LIQUIDATE_AGED',
          title: `Promoción o liquidación de ${s.name}`,
          reason: `${formatNumber(s.redUnits)} u llevan hasta ${s.maxDays} días sin moverse y ninguna bodega lo está vendiendo. `
            + `Liquidar con ~30 % de descuento recupera ${formatUsd(s.redValueUsd * 0.7)}; si se queda, se perderían ${formatUsd(s.redValueUsd * LOSS_RATE)}.`,
          skuId: s.skuId, unitId: s.unitIds[0] ?? null, estimatedImpactUsd: s.redValueUsd * LOSS_RATE, quantity: s.redUnits, status: 'PROPOSED', assumptions,
        });
      }
    } else if (s.band.key === 'ambar' && s.amberValueUsd >= MIN_AGED_USD) {
      out.push({
        id: `rec-fifo-${s.skuId.toLowerCase()}`, type: 'PRIORITIZE_FIFO',
        title: `Despachar primero lo más antiguo de ${s.name}`,
        reason: `${formatNumber(s.amberUnits)} u llevan ${s.maxDays} días en bodega. Si se despachan antes que lo nuevo (FIFO), `
          + `no llegan a inventario hueso (${formatUsd(s.amberValueUsd)} en juego).`,
        skuId: s.skuId, unitId: s.unitIds[0] ?? null, estimatedImpactUsd: s.amberValueUsd * LOSS_RATE, quantity: s.amberUnits, status: 'PROPOSED', assumptions,
      });
    }
  }
  // Lo más urgente primero y una lista corta (la página de Acciones debe leerse de un vistazo).
  const rank = { MOVE_AGED: 0, LIQUIDATE_AGED: 1, PRIORITIZE_FIFO: 2 } as Record<string, number>;
  const sorted = out.sort((a, b) => rank[a.type] - rank[b.type] || (b.estimatedImpactUsd ?? 0) - (a.estimatedImpactUsd ?? 0));
  return [
    ...sorted.filter((r) => r.type === 'MOVE_AGED').slice(0, 2),
    ...sorted.filter((r) => r.type === 'LIQUIDATE_AGED').slice(0, 2),
    ...sorted.filter((r) => r.type === 'PRIORITIZE_FIFO').slice(0, 1),
  ];
}
