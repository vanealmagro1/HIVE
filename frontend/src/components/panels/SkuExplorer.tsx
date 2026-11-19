// Analítica por producto con estado compartido (ui.skuId): el mismo SKU que se selecciona en el gemelo
// se grafica aquí, y las recomendaciones se filtran por él.
import { Box } from 'lucide-react';
import type { SkuAnalytics } from '../../analytics/analytics';
import { formatUsd } from '../../domain/format';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import type { Actions } from '../actions';
import { CoverageBlock, DemandChart, StockChart } from '../charts/SkuInsight';
import RecommendationCard from './RecommendationCard';

export const exposureOf = (a: SkuAnalytics) => Math.max(a.excessExposureUsd ?? 0, a.expiryExposureUsd ?? 0, a.stagnantValueUsd ?? 0);

/** SKU en foco: el elegido (o el de la unidad seleccionada); si no hay, el de mayor exposición. */
export function focusedSku(state: DemoState): SkuAnalytics | undefined {
  const all = computeAnalytics(state);
  return all.find((a) => a.skuId === state.ui.skuId) ?? [...all].sort((x, y) => exposureOf(y) - exposureOf(x))[0];
}

export default function SkuExplorer({ state, actions }: { state: DemoState; actions: Actions }) {
  const all = computeAnalytics(state);
  const a = focusedSku(state);
  if (!a) return null;
  const ranked = [...all].sort((x, y) => exposureOf(y) - exposureOf(x));
  const priority = ranked.filter((x) => exposureOf(x) > 0).slice(0, 8);
  const others = [...all].filter((x) => !priority.includes(x)).sort((x, y) => x.skuName.localeCompare(y.skuName));
  const recs = state.recommendations.filter((r) => r.skuId === a.skuId && r.type !== 'VERIFY_LOCATION');
  const pallets = state.units.filter((u) => u.type === 'PALLET' && state.lots.some((l) => l.id === u.lotId && l.skuId === a.skuId));
  return (
    <section className="card sku-explorer" data-testid="sku-explorer">
      <div className="explorer-head">
        <div>
          <h2 style={{ margin: 0 }}>{a.skuName}</h2>
          <div className="muted small">{a.skuId} · {pallets.length} pallets en el gemelo · datos sintéticos al {state.referenceDate}</div>
        </div>
        <label className="sku-select">
          <span className="eyebrow">Producto</span>
          <select value={a.skuId} onChange={(e) => actions.setSku(e.target.value)} aria-label="Producto a analizar" data-testid="sku-select">
            <optgroup label="Mayor valor en riesgo">
              {priority.map((x) => <option key={x.skuId} value={x.skuId}>{x.skuName} · {x.skuId} ({formatUsd(exposureOf(x))})</option>)}
            </optgroup>
            <optgroup label="Todos los productos">
              {others.map((x) => <option key={x.skuId} value={x.skuId}>{x.skuName} · {x.skuId}</option>)}
            </optgroup>
          </select>
        </label>
        {pallets[0] && (
          <button type="button" className="btn" onClick={() => actions.locateSku(a.skuId)}><Box size={16} /> Ver en el gemelo</button>
        )}
      </div>
      <CoverageBlock a={a} />
      <div className="explorer-charts">
        <DemandChart state={state} a={a} />
        <StockChart state={state} a={a} />
      </div>
      <p className="note">
        Proyección = promedio de los últimos {a.windowDays} días (sin modelo de IA). La banda muestra la variabilidad diaria observada
        (±1 desviación estándar), no una probabilidad. El stock histórico se reconstruye desde el stock actual con despachos,
        recepciones y traslados registrados; los traslados internos no cuentan como demanda.
      </p>
      {recs.length > 0 && (
        <div className="explorer-recs">
          {recs.map((r) => <RecommendationCard key={r.id} rec={r} task={state.tasks.find((t) => t.recommendationId === r.id)} actions={actions} />)}
        </div>
      )}
    </section>
  );
}
