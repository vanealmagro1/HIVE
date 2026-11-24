// Analítica: demanda, cobertura y exposición por producto (fórmulas visibles).
import { Archive, CircleDollarSign, Clock, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { demandSeries } from '../../analytics/series';
import { formatNumber, formatUsd } from '../../domain/format';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import type { Actions } from '../actions';
import { DemandBars, StockLine } from '../charts/ProductCharts';
import { CoverageBlock } from '../charts/SkuInsight';
import { Chip, Kpi, PageHead, productIcon } from '../layout/Shell';

const DEFAULT_SKU = 'MOC-001';
const n = (v: number | null, d = 1) => (v === null ? '—' : formatNumber(v, Number.isInteger(v) ? 0 : d));

export default function AnalyticsPage({ state, actions }: { state: DemoState; actions: Actions }) {
  const all = computeAnalytics(state);
  // Productos con pronóstico, ordenados por exposición (los que requieren decisión primero).
  const options = useMemo(() => [...all].filter((a) => a.forecastAvailable)
    .sort((a, b) => (b.excessExposureUsd ?? 0) + (b.expiryExposureUsd ?? 0) - (a.excessExposureUsd ?? 0) - (a.expiryExposureUsd ?? 0)), [all]);
  const skuId = state.ui.skuId && all.some((a) => a.skuId === state.ui.skuId) ? state.ui.skuId : DEFAULT_SKU;
  const a = all.find((x) => x.skuId === skuId)!;
  const sku = state.skus.find((k) => k.id === skuId);
  const target = a.targetCoverageDays;
  const targetStock = a.dailyDemand !== null ? a.dailyDemand * target : null;
  const hasRec = state.recommendations.some((r) => r.skuId === skuId && r.type !== 'VERIFY_LOCATION');
  const mean = demandSeries(state, skuId, a).mean;

  return (
    <div className="page" data-testid="page-analitica">
      <PageHead state={state} title="Analítica" sub="Explora demanda, cobertura y exposición por producto.">
        <select className="select" value={skuId} aria-label="Producto" onChange={(e) => actions.setSku(e.target.value)} style={{ maxWidth: 320 }}>
          {!options.some((o) => o.skuId === skuId) && <option value={skuId}>{a.skuName} · {skuId}</option>}
          {options.map((o) => <option key={o.skuId} value={o.skuId}>{o.skuName} · {o.skuId}</option>)}
        </select>
      </PageHead>

      <div className="product-pills" role="radiogroup" aria-label="Productos con decisiones pendientes">
        {options.slice(0, 6).map((o) => {
          const Icon = productIcon(o.skuId);
          return (
            <button key={o.skuId} type="button" role="radio" aria-checked={o.skuId === skuId}
              className={`product-pill${o.skuId === skuId ? ' is-on' : ''}`} onClick={() => actions.setSku(o.skuId)}>
              <span className="pp-icon"><Icon size={14} /></span>{o.skuName}
            </button>
          );
        })}
      </div>

      <section className="kpis" aria-label="Indicadores del producto">
        <Kpi label="Stock actual" value={formatNumber(a.stock)} caption="Unidades registradas" icon={Archive} testId="an-stock" />
        <Kpi label="Cobertura estimada" value={a.coverageDays === null ? '—' : `${n(a.coverageDays)} días`} caption={`Objetivo: ${target} días`} icon={Clock} tone="blue" testId="an-coverage" />
        <Kpi label="Exceso estimado" value={a.excessUnits === null ? '—' : formatNumber(Math.max(0, a.excessUnits))} caption={targetStock === null ? 'Sin pronóstico' : `Stock objetivo: ${formatNumber(targetStock)} uds.`} icon={TriangleAlert} tone="amber" testId="an-excess" />
        <Kpi label="Exposición estimada" value={formatUsd(a.excessExposureUsd ?? 0)} caption={`USD ${formatNumber(sku?.unitCost ?? 0, 2)} por unidad excedente`} icon={CircleDollarSign} tone="green" testId="an-exposure" />
      </section>

      <div className="grid-1-1">
        <section className="card">
          <div className="card-head">
            <div><h2 className="card-title">Demanda por día</h2><p className="card-sub"><strong className="chart-product">{a.skuName}</strong> · {mean === null ? 'sin datos suficientes para proyectar' : `media ${n(mean)} u/día`}</p></div>
            <Chip tone="info">Datos simulados</Chip>
          </div>
          <DemandBars state={state} a={a} />
        </section>
        <section className="card">
          <div className="card-head">
            <div><h2 className="card-title">Evolución del stock</h2><p className="card-sub"><strong className="chart-product">{a.skuName}</strong> · hoy {formatNumber(a.stock)} u</p></div>
          </div>
          <StockLine state={state} a={a} />
        </section>
      </div>

      <section className="card" data-testid="formula-card">
        <div className="card-head">
          <div><h2 className="card-title">Cálculo de indicadores</h2><p className="card-sub">{a.skuName} · {skuId}</p></div>
          {hasRec && <button type="button" className="btn btn-small btn-soft" onClick={() => actions.setSection('acciones')}>Ver recomendación</button>}
        </div>
        <CoverageBlock a={a} compact />
        <div className="formula-list">
          <div>Cobertura = stock ÷ demanda diaria = {formatNumber(a.stock)} ÷ {n(a.dailyDemand)} = <strong>{a.coverageDays === null ? '—' : `${n(a.coverageDays)} días`}</strong></div>
          <div>Stock objetivo = demanda diaria × días objetivo = {n(a.dailyDemand)} × {target} = <strong>{targetStock === null ? '—' : `${formatNumber(targetStock)} uds.`}</strong></div>
          <div>Exposición = costo unitario × unidades excedentes = {formatUsd(sku?.unitCost ?? 0)} × {formatNumber(Math.max(0, a.excessUnits ?? 0))} = <strong>{formatUsd(a.excessExposureUsd ?? 0)}</strong></div>
        </div>
      </section>
    </div>
  );
}
