// Analítica de un producto: demanda (histórica + proyectada), evolución del stock y cobertura.
// Todo sale de computeAnalytics/series (estado único); ningún número está escrito en la interfaz.
import type { SkuAnalytics } from '../../analytics/analytics';
import { demandSeries, stockSeries } from '../../analytics/series';
import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import TimeChart from './TimeChart';

const C_OBS = '#6336e8';
const C_BAND = 'rgba(99, 54, 232, 0.13)';

const n = (v: number | null, d = 0) => (v === null ? '—' : formatNumber(v, Number.isInteger(v) ? 0 : d));

export function DemandChart({ state, a, compact = false }: { state: DemoState; a: SkuAnalytics; compact?: boolean }) {
  const d = demandSeries(state, a.skuId, a);
  const series = [
    { id: 'hist', label: 'Despachos registrados (sintéticos)', color: C_OBS, points: d.history.map((p) => ({ date: p.date, value: p.units })) },
    ...(d.projection.length ? [{ id: 'proj', label: 'Proyección (promedio 30 días)', color: C_OBS, dashed: true, points: d.projection.map((p) => ({ date: p.date, value: p.units })) }] : []),
  ];
  const band = d.bandAvailable ? { label: 'Variabilidad observada (±1 σ)', color: C_BAND, points: d.projection.map((p) => ({ date: p.date, low: p.low ?? 0, high: p.high ?? 0 })) } : null;
  return (
    <TimeChart
      title={compact ? undefined : <>Demanda diaria · <span className="muted">{a.skuName}</span></>}
      series={series}
      band={band}
      today={d.projection.length ? state.referenceDate : undefined}
      height={compact ? 84 : 190}
      compact={compact}
      unit="u/día"
      testId={compact ? 'mini-demand-chart' : 'demand-chart'}
      ariaLabel={`Demanda diaria de ${a.skuName}: ${d.history.length} días registrados${d.mean !== null ? `, promedio ${n(d.mean, 1)} u/día proyectado ${d.projection.length} días` : ', sin proyección'}`}
    />
  );
}

export function StockChart({ state, a }: { state: DemoState; a: SkuAnalytics }) {
  const s = stockSeries(state, a.skuId, a);
  const series = [
    { id: 'stock', label: 'Stock (reconstruido)', color: C_OBS, points: s.history.map((p) => ({ date: p.date, value: p.stock })) },
    ...(s.projection.length ? [{ id: 'proj', label: 'Stock proyectado', color: C_OBS, dashed: true, points: s.projection.map((p) => ({ date: p.date, value: p.stock })) }] : []),
  ];
  const markers = s.history.filter((p) => p.transferOut > 0).map((p) => ({ date: p.date, value: p.stock, label: `Traslado −${formatNumber(p.transferOut)} u` }));
  const entries = s.history.filter((p) => p.inflow > 0).map((p) => ({ date: p.date, value: p.stock, label: `Entrada +${formatNumber(p.inflow)} u` }));
  return (
    <TimeChart
      title={<>Evolución del stock · <span className="muted">bodega principal</span></>}
      series={series}
      reference={s.targetStock !== null ? { value: s.targetStock, label: 'Stock objetivo' } : null}
      markers={[...markers, ...entries]}
      today={state.referenceDate}
      height={190}
      unit="u"
      testId="stock-chart"
      ariaLabel={`Stock de ${a.skuName}: hoy ${formatNumber(a.stock)} u${s.targetStock !== null ? `, objetivo ${formatNumber(s.targetStock)} u` : ''}`}
    />
  );
}

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
