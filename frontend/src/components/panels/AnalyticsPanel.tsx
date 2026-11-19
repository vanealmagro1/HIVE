import type { SkuAnalytics } from '../../analytics/analytics';
import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import type { Actions } from '../actions';
import RecommendationCard from './RecommendationCard';

const n = (v: number | null) => (v === null ? '—' : formatNumber(v, Number.isInteger(v) ? 0 : 1));

function SkuCard({ a }: { a: SkuAnalytics }) {
  return (
    <article className="sku-card" data-testid={`analytics-${a.skuId}`}>
      <header className="sku-head">
        <strong>{a.skuId}</strong> <span className="muted">{a.skuName}</span>
        <span className="pill">Datos SINTÉTICOS</span>
      </header>
      {!a.forecastAvailable ? (
        <div className="no-forecast">
          <strong>{a.insufficientDataMessage}</strong>
          <div className="small muted">{a.daysWithDispatch} de {a.windowDays} días con despachos (mínimo 7). No se calcula cobertura ni vencimiento.</div>
        </div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric"><div className="metric-label">Cobertura</div><div className="metric-value">{n(a.coverageDays)} días</div></div>
            <div className="metric"><div className="metric-label">Exceso potencial</div><div className="metric-value">{n(a.excessUnits)} unidades</div></div>
            <div className="metric"><div className="metric-label">Valor potencial en riesgo (exceso)</div><div className="metric-value">{formatUsd(a.excessExposureUsd ?? 0)}</div></div>
          </div>
          <div className="formula small">
            <div>Demanda diaria = {n(a.dispatchedInWindow)} u ÷ {a.windowDays} días = <strong>{n(a.dailyDemand)} u/día</strong></div>
            <div>Cobertura = {n(a.stock)} u ÷ {n(a.dailyDemand)} u/día = <strong>{n(a.coverageDays)} días</strong></div>
            <div>Exceso = máx(0, {n(a.stock)} − {n(a.dailyDemand)} × {a.targetCoverageDays}) = <strong>{n(a.excessUnits)} u</strong></div>
            <div>Exposición = {n(a.excessUnits)} u × {formatUsd(a.unitCost)} = <strong>{formatUsd(a.excessExposureUsd ?? 0)}</strong></div>
          </div>
          {a.expiryRisks.map((r) => (
            <div key={r.lotId} className="formula formula-expiry small">
              <div><strong>FEFO · {r.lotId}</strong> vence {r.expiryDate} (en {r.daysUntilExpiry} días)</div>
              <div>Remanente al vencer = máx(0, {n(r.lotStock)} − {n(a.dailyDemand)} × {r.daysUntilExpiry}) = <strong>{n(r.remainingAtExpiry)} u</strong></div>
              <div>Exposición = {n(r.remainingAtExpiry)} u × {formatUsd(a.unitCost)} = <strong>{formatUsd(r.exposureUsd)}</strong></div>
            </div>
          ))}
          <div className="small muted">Cobertura de datos: {a.daysWithDispatch}/{a.windowDays} días con despachos → <strong>{a.dataCoverage}</strong> (indicador cualitativo, no probabilidad).</div>
        </>
      )}
      {a.stagnantByRule && (
        <div className="rule small">
          Regla de inmovilizado: {a.daysSinceLastDispatch} días desde el último despacho ({a.lastDispatchDate}) &gt; 60 →
          valor inmovilizado {formatUsd(a.stagnantValueUsd ?? 0)}. <em>Regla, no predicción.</em>
        </div>
      )}
      <details>
        <summary className="small">Supuestos y limitaciones</summary>
        <ul className="small">{[...a.assumptions, ...a.limitations].map((x) => <li key={x}>{x}</li>)}</ul>
      </details>
    </article>
  );
}

export default function AnalyticsPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const analytics = actions.api.getAnalytics().data ?? [];
  const recs = state.recommendations.filter((r) => r.type !== 'VERIFY_LOCATION');
  return (
    <div data-testid="analytics-panel">
      <h2>Predicción explicable</h2>
      <p className="small muted">Fecha de cálculo fija {state.referenceDate} · ventana 30 días · cobertura objetivo 30 días · estimaciones deterministas, no ML.</p>
      {analytics.map((a) => (
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
