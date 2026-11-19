import type { SkuAnalytics } from '../../analytics/analytics';
import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import type { Actions } from '../actions';
import RecommendationCard from './RecommendationCard';

const n = (v: number | null) => (v === null ? '—' : formatNumber(v, Number.isInteger(v) ? 0 : 1));

/** Frase de negocio que resume el cálculo. */
function storyOf(a: SkuAnalytics): string {
  if (!a.forecastAvailable) return 'No hay suficientes ventas recientes para proyectar este producto.';
  const parts = [`Hay ${n(a.stock)} u y se despachan ${n(a.dailyDemand)} al día: alcanzan para ${n(a.coverageDays)} días (objetivo: ${a.targetCoverageDays}).`];
  const risk = a.expiryRisks.find((r) => r.remainingAtExpiry > 0);
  if (risk) parts.push(`Un lote vence el ${risk.expiryDate}: al ritmo actual quedarían ${n(risk.remainingAtExpiry)} u sin vender.`);
  return parts.join(' ');
}

function SkuCard({ a }: { a: SkuAnalytics }) {
  const risk = a.expiryRisks.find((r) => r.remainingAtExpiry > 0);
  return (
    <article className="sku-card" data-testid={`analytics-${a.skuId}`}>
      <header className="sku-head">
        <span className="sku-name">{a.skuName}</span> <span className="muted small">{a.skuId}</span>
        <span className="pill">Datos sintéticos</span>
      </header>
      <div className="story">{storyOf(a)}</div>
      {!a.forecastAvailable ? (
        <div className="no-forecast">
          <strong>{a.insufficientDataMessage}</strong>
          <div className="small muted">{a.daysWithDispatch} de {a.windowDays} días con despachos (mínimo 7).</div>
        </div>
      ) : (
        <div className="metrics">
          <div className="metric"><div className="metric-label">Cobertura</div><div className="metric-value">{n(a.coverageDays)} días</div></div>
          {risk ? (
            <>
              <div className="metric"><div className="metric-label">Quedarían al vencer</div><div className="metric-value">{n(risk.remainingAtExpiry)} unidades</div></div>
              <div className="metric"><div className="metric-label">Valor en riesgo (vencimiento)</div><div className="metric-value">{formatUsd(risk.exposureUsd)}</div></div>
            </>
          ) : (
            <>
              <div className="metric"><div className="metric-label">Exceso sobre el objetivo</div><div className="metric-value">{n(a.excessUnits)} unidades</div></div>
              <div className="metric"><div className="metric-label">Valor en riesgo (exceso)</div><div className="metric-value">{formatUsd(a.excessExposureUsd ?? 0)}</div></div>
            </>
          )}
        </div>
      )}
      {a.stagnantByRule && (
        <div className="rule small">
          Sin despachos desde hace {a.daysSinceLastDispatch} días ({a.lastDispatchDate}): capital inmovilizado de {formatUsd(a.stagnantValueUsd ?? 0)}. <em>Es una regla (más de 60 días), no una predicción.</em>
        </div>
      )}
      <details>
        <summary>Ver cálculo y supuestos</summary>
        {a.forecastAvailable && (
          <div className="formula">
            <div>Demanda diaria = {n(a.dispatchedInWindow)} u ÷ {a.windowDays} días = <strong>{n(a.dailyDemand)} u/día</strong></div>
            <div>Cobertura = {n(a.stock)} u ÷ {n(a.dailyDemand)} u/día = <strong>{n(a.coverageDays)} días</strong></div>
            <div>Exceso = máx(0, {n(a.stock)} − {n(a.dailyDemand)} × {a.targetCoverageDays}) = <strong>{n(a.excessUnits)} u</strong></div>
            <div>Exposición = {n(a.excessUnits)} u × {formatUsd(a.unitCost)} = <strong>{formatUsd(a.excessExposureUsd ?? 0)}</strong></div>
          </div>
        )}
        {a.expiryRisks.map((r) => (
          <div key={r.lotId} className="formula formula-expiry">
            <div><strong>FEFO · {r.lotId}</strong> vence {r.expiryDate} (en {r.daysUntilExpiry} días)</div>
            <div>Remanente al vencer = máx(0, {n(r.lotStock)} − {n(a.dailyDemand)} × {r.daysUntilExpiry}) = <strong>{n(r.remainingAtExpiry)} u</strong></div>
            <div>Exposición = {n(r.remainingAtExpiry)} u × {formatUsd(a.unitCost)} = <strong>{formatUsd(r.exposureUsd)}</strong></div>
          </div>
        ))}
        <div className="small muted">Datos: {a.daysWithDispatch}/{a.windowDays} días con despachos → cobertura de datos {a.dataCoverage} (indicador cualitativo, no probabilidad).</div>
        <ul className="small">{[...a.assumptions, ...a.limitations].map((x) => <li key={x}>{x}</li>)}</ul>
      </details>
    </article>
  );
}

export default function AnalyticsPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const analytics = actions.api.getAnalytics().data ?? [];
  const recs = state.recommendations.filter((r) => r.type !== 'VERIFY_LOCATION');
  // Priorizar: primero lo que más dinero expone.
  const exposure = (a: SkuAnalytics) => Math.max(a.excessExposureUsd ?? 0, a.expiryExposureUsd ?? 0, a.stagnantValueUsd ?? 0);
  const sorted = [...analytics].sort((x, y) => exposure(y) - exposure(x));
  return (
    <div data-testid="analytics-panel">
      <h2>Predicciones</h2>
      <p className="panel-intro">Productos ordenados por dinero en riesgo. Cálculos explicables con las ventas de los últimos 30 días (al {state.referenceDate}); no es un modelo de IA.</p>
      {sorted.map((a) => (
        <div key={a.skuId}>
          <SkuCard a={a} />
          {recs.filter((r) => r.skuId === a.skuId).map((r) => (
            <RecommendationCard key={r.id} rec={r} task={state.tasks.find((t) => t.recommendationId === r.id)} actions={actions} showAssumptions />
          ))}
        </div>
      ))}
    </div>
  );
}
