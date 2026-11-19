import { MapPin } from 'lucide-react';
import { unitDetail } from '../../domain/inventory';
import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { describeLocation, eventSourceLabel, STATUS_LABEL, unitContents } from '../../store/selectors';
import type { Actions } from '../actions';
import { productIcon } from '../layout/Shell';
import { computeAnalytics } from '../../store/demoState';
import { CoverageBlock, DemandChart } from '../charts/SkuInsight';
import RecommendationCard from './RecommendationCard';

/** Analítica del producto seleccionado en el gemelo (mismo estado que la sección Analítica). */
function SkuContext({ state, actions, skuId }: { state: DemoState; actions: Actions; skuId: string }) {
  const a = computeAnalytics(state).find((x) => x.skuId === skuId);
  if (!a) return null;
  const recs = state.recommendations.filter((r) => r.skuId === skuId && r.type !== 'VERIFY_LOCATION');
  return (
    <section className="sku-context" data-testid="sku-context">
      <div className="eyebrow">Demanda y cobertura de este producto</div>
      <DemandChart state={state} a={a} compact />
      <div className="note">Línea continua: despachos registrados · punteada: proyección.</div>
      <CoverageBlock a={a} compact />
      {recs.map((r) => <RecommendationCard key={r.id} rec={r} task={state.tasks.find((t) => t.recommendationId === r.id)} actions={actions} />)}
      <button type="button" className="btn btn-small" onClick={() => { actions.setSku(skuId); actions.setSection('analitica'); }}>Ver analítica completa</button>
    </section>
  );
}

/** Ficha de una unidad: producto → SKU · cantidad → pallet → ubicación → estado. Pallets mixtos con desglose. */
export default function UnitPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const id = state.ui.selectedUnitId;
  const detail = id ? unitDetail(state.units, state.lots, state.skus, id) : null;
  if (!detail) {
    const pallets = state.units.filter((u) => u.type === 'PALLET').length;
    const boxes = state.units.filter((u) => u.type === 'BOX').length;
    return (
      <div className="panel-empty">
        <h2>Selecciona un pallet</h2>
        <p className="muted">Haz clic en el gemelo para ver qué producto contiene, dónde está y su última lectura.</p>
        <p className="small muted">{pallets} pallets · {boxes} cajas con etiqueta RFID · {state.locations.length} ubicaciones.</p>
      </div>
    );
  }
  const { unit, lot, children } = detail;
  const c = unitContents(state, unit);
  const Icon = productIcon(c.skuId);
  const value = c.lines.reduce((t, l) => t + l.qty * (state.skus.find((k) => k.id === l.skuId)?.unitCost ?? 0), 0);
  const evidence = state.events.filter((e) => e.unitId === unit.id || (unit.parentId && e.unitId === unit.parentId));
  const mismatch = unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId;

  return (
    <div className="unit-panel" data-testid="unit-panel">
      <div className="product-row" style={{ marginBottom: 12 }}>
        <span className="product-icon"><Icon size={22} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="product-name" data-testid="unit-title">{c.title}</div>
          <div className="product-sub">{c.subtitle}</div>
        </div>
        <span className="ref-badge">{unit.id}</span>
      </div>
      <h2 className="eyebrow" style={{ margin: '0 0 6px' }}>{unit.type === 'PALLET' ? 'Pallet' : 'Caja'} {unit.id}</h2>
      <span className={`status-badge status-${unit.verificationStatus}`}>{STATUS_LABEL[unit.verificationStatus]}</span>

      {c.kind === 'mixed' && (
        <div className="mix-lines" data-testid="mix-lines">
          {c.lines.map((l) => <div key={l.skuId} className="mix-line"><span><strong>{l.name}</strong> <span className="muted">· {l.skuId}</span></span><span>{formatNumber(l.qty)} u</span></div>)}
        </div>
      )}

      <dl className="kv">
        <dt>Ubicación</dt><dd><strong><MapPin size={13} /> {describeLocation(state, unit.expectedLocationId)}</strong></dd>
        <dt>Evidencia</dt>
        <dd className={mismatch ? 'text-warn' : undefined}>
          {!unit.observedLocationId ? 'Sin lecturas registradas'
            : mismatch ? `Detectada en ${unit.observedLocationId}` : 'En su ubicación registrada'}
          {unit.lastObservedAt && <div className="muted small">{unit.lastObservedAt}</div>}
        </dd>
        <dt>Valor</dt><dd>{formatUsd(value)}</dd>
        {c.kind === 'single' && <><dt>Lote · vence</dt><dd>{lot?.id ?? '—'} · {lot?.expiryDate ?? 'Sin caducidad'}</dd></>}
      </dl>
      {children.length > 0 && (
        <details>
          <summary>Cajas ({children.length})</summary>
          <ul className="plain-list small">
            {children.map((k) => (
              <li key={k.id}>
                <button type="button" className="link-btn" onClick={() => actions.select(k.id)}>{k.id}</button>
                {' '}· {unitContents(state, k).title} · {formatNumber(k.quantityBaseUnits)} u
              </li>
            ))}
          </ul>
          <p className="muted small">El stock suma cajas; el pallet no se vuelve a sumar.</p>
        </details>
      )}
      {unit.parentId && (
        <p className="small">Pertenece a <button type="button" className="link-btn" onClick={() => actions.select(unit.parentId!)}>{unit.parentId}</button></p>
      )}
      {c.kind === 'single' && c.skuId && <SkuContext state={state} actions={actions} skuId={c.skuId} />}
      {evidence.length > 0 && (
        <details>
          <summary>Lecturas ({evidence.length})</summary>
          <ul className="plain-list small">
            {evidence.map((e) => (
              <li key={e.id}>
                <span className="source-tag">{e.source}</span> {eventSourceLabel(e)} · {e.type === 'OBSERVATION' ? `en ${e.locationHintId}` : e.type === 'MISSED_READ' ? 'sin respuesta' : 'recepción'}
                <div className="muted">{e.capturedAt} · <code>{e.id}</code></div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
