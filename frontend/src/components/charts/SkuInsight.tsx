// Cobertura de un producto frente a su objetivo (barra + fórmula).
// Todo sale de computeAnalytics/series (estado único); ningún número está escrito en la interfaz.
import type { SkuAnalytics } from '../../analytics/analytics';
import { formatNumber, formatUsd } from '../../domain/format';

const n = (v: number | null, d = 0) => (v === null ? '—' : formatNumber(v, Number.isInteger(v) ? 0 : d));

/** Cobertura actual frente a la objetivo, con exceso o déficit y su fórmula. */
export function CoverageBlock({ a, compact = false }: { a: SkuAnalytics; compact?: boolean }) {
  if (!a.forecastAvailable || a.coverageDays === null || a.dailyDemand === null) {
    return <div className="no-forecast small"><strong>{a.insufficientDataMessage}</strong> · {a.daysWithDispatch} de {a.windowDays} días con despachos.</div>;
  }
  const target = a.targetCoverageDays;
  const targetStock = a.dailyDemand * target;
  const diff = a.stock - targetStock;
  const scale = Math.max(a.coverageDays, target) * 1.1;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div className="coverage" data-testid="coverage-block">
      {!compact && (
        <div className="facts facts-4">
          <div className="fact"><div className="fact-value">{formatNumber(a.stock)} u</div><div className="fact-label">stock actual</div></div>
          <div className="fact"><div className="fact-value">{n(a.dailyDemand, 1)} u</div><div className="fact-label">demanda diaria</div></div>
          <div className={`fact${a.coverageDays > target ? ' warn' : ''}`}><div className="fact-value">{n(a.coverageDays, 1)} días</div><div className="fact-label">cobertura (objetivo {target})</div></div>
          <div className={`fact${diff > 0 ? ' warn' : diff < 0 ? '' : ' good'}`}>
            <div className="fact-value">{diff > 0 ? `+${formatNumber(diff)}` : formatNumber(diff)} u</div>
            <div className="fact-label">{diff > 0 ? `exceso · ${formatUsd(a.excessExposureUsd ?? 0)}` : diff < 0 ? 'déficit' : 'en objetivo'}</div>
          </div>
        </div>
      )}
      <div className="cov-bar" role="img" aria-label={`Cobertura ${n(a.coverageDays, 1)} días frente a un objetivo de ${target} días`}>
        <span className="cov-fill" style={{ width: pct(a.coverageDays) }} />
        <span className="cov-target" style={{ left: pct(target) }} />
      </div>
      <div className="cov-scale small muted">
        <span>0</span><span style={{ left: pct(target), transform: (target / scale) > 0.75 ? 'translateX(-100%)' : undefined }} className="cov-target-label">objetivo {target} días</span>
        <span>{Math.abs(a.coverageDays - target) / scale > 0.18 ? `${n(a.coverageDays, 1)} días` : ''}</span>
      </div>
      {!compact && (
        <div className="formula-inline small">
          <span>Cobertura = {formatNumber(a.stock)} u ÷ {n(a.dailyDemand, 1)} u/día = <strong>{n(a.coverageDays, 1)} días</strong></span>
          <span>Stock objetivo = {n(a.dailyDemand, 1)} u/día × {target} días = <strong>{formatNumber(targetStock)} u</strong></span>
        </div>
      )}
    </div>
  );
}
