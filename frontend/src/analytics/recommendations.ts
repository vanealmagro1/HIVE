// Recomendaciones derivadas de la analítica. Son PROPUESTAS para revisión humana;
// aprobarlas crea una tarea y NUNCA modifica inventario ni datos oficiales.
import { formatNumber, formatUsd } from '../domain/format';
import type { Recommendation } from '../domain/types';
import type { SkuAnalytics } from './analytics';

/** Umbral para proponer acciones: por debajo, el costo de gestionar supera el beneficio esperado. */
export const MIN_IMPACT_USD = 250;

export function buildAnalyticsRecommendations(analytics: SkuAnalytics[]): Recommendation[] {
  const out: Recommendation[] = [];
  for (const a of analytics) {
    if (a.forecastAvailable && a.excessUnits !== null && a.excessUnits > 0 && (a.excessExposureUsd ?? 0) >= MIN_IMPACT_USD) {
      out.push({
        id: `rec-${a.skuId.toLowerCase()}`,
        type: 'REVIEW_EXCESS',
        title: 'Revisar stock y evaluar redistribución',
        reason: `${a.skuName}: cobertura de ${formatNumber(a.coverageDays ?? 0)} días frente a un objetivo de ${a.targetCoverageDays}; `
          + `exceso potencial de ${formatNumber(a.excessUnits)} unidades (${formatUsd(a.excessExposureUsd ?? 0)} estimados).`,
        skuId: a.skuId,
        unitId: null,
        estimatedImpactUsd: a.excessExposureUsd,
        status: 'PROPOSED',
        assumptions: a.assumptions,
      });
    }
    if (a.expiryExposureUsd !== null && a.expiryExposureUsd >= MIN_IMPACT_USD) {
      const lots = a.expiryRisks.filter((r) => r.remainingAtExpiry > 0).map((r) => r.lotId).join(', ');
      out.push({
        id: `rec-${a.skuId.toLowerCase()}`,
        type: 'PRIORITIZE_FEFO',
        title: 'Priorizar despacho FEFO del lote próximo a vencer',
        reason: `${a.skuName} (${lots}): al ritmo actual quedarían ${formatNumber(a.expiryRemainingUnits ?? 0)} unidades al vencer `
          + `(${formatUsd(a.expiryExposureUsd)} estimados).`,
        skuId: a.skuId,
        unitId: null,
        estimatedImpactUsd: a.expiryExposureUsd,
        status: 'PROPOSED',
        assumptions: a.assumptions,
      });
    }
  }
  return out;
}
