import { unitDetail } from '../../domain/inventory';
import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { describeLocation, STATUS_ICON, STATUS_LABEL } from '../../store/selectors';
import type { Actions } from '../actions';

export default function UnitPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const id = state.ui.selectedUnitId;
  const detail = id ? unitDetail(state.units, state.lots, state.skus, id) : null;
  if (!detail) {
    return (
      <div className="panel-empty">
        <p>Seleccione un pallet en la escena 3D (o use <strong>1 · Seleccionar PAL-001</strong>).</p>
        <p className="muted">8 pallets y 16 cajas sintéticas en 3 zonas, 6 racks y 18 ubicaciones.</p>
      </div>
    );
  }
  const { unit, lot, sku, children } = detail;
  const evidence = state.events.filter((e) => e.unitId === unit.id || (unit.parentId && e.unitId === unit.parentId));
  const mismatch = unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId;

  return (
    <div className="unit-panel" data-testid="unit-panel">
      <h2>{unit.type === 'PALLET' ? 'Pallet' : 'Caja'} {unit.id}</h2>
      <div className={`status-badge status-${unit.verificationStatus}`}>
        {STATUS_ICON[unit.verificationStatus]} {STATUS_LABEL[unit.verificationStatus]}
      </div>
      <dl className="kv">
        <dt>SKU</dt><dd>{sku ? `${sku.id} · ${sku.name}` : '—'}</dd>
        <dt>Lote</dt><dd>{lot?.id ?? '—'}</dd>
        <dt>Vencimiento</dt><dd>{lot?.expiryDate ?? 'Sin caducidad'}</dd>
        <dt>Cantidad</dt>
        <dd>
          {formatNumber(unit.quantityBaseUnits)} u
          {unit.type === 'PALLET' && children.length > 0 && <span className="muted"> (contenido declarado = suma de {children.length} cajas)</span>}
        </dd>
        <dt>Costo / valor</dt><dd>{sku ? `${formatUsd(sku.unitCost)} / u · ${formatUsd(unit.quantityBaseUnits * sku.unitCost)}` : '—'}</dd>
        <dt>Ubicación esperada</dt><dd><strong>{describeLocation(state, unit.expectedLocationId)}</strong></dd>
        <dt>Ubicación observada</dt>
        <dd className={mismatch ? 'text-warn' : undefined}>
          {unit.observedLocationId ? `${describeLocation(state, unit.observedLocationId)} (evidencia, no confirmada)` : 'Sin observación registrada'}
        </dd>
        <dt>Última observación</dt><dd>{unit.lastObservedAt ?? '—'}</dd>
      </dl>
      {children.length > 0 && (
        <>
          <h3>Cajas hijas</h3>
          <ul className="plain-list">
            {children.map((c) => (
              <li key={c.id}>
                <button type="button" className="link-btn" onClick={() => actions.select(c.id)}>{c.id}</button>
                {' '}· {formatNumber(c.quantityBaseUnits)} u · {STATUS_LABEL[c.verificationStatus]}
              </li>
            ))}
          </ul>
          <p className="muted small">Una lectura del pallet no verifica individualmente sus cajas. El stock del SKU suma cajas; el pallet no se suma de nuevo.</p>
        </>
      )}
      {unit.parentId && (
        <p>Pertenece a <button type="button" className="link-btn" onClick={() => actions.select(unit.parentId!)}>{unit.parentId}</button></p>
      )}
      <h3>Evidencia</h3>
      {evidence.length === 0 ? <p className="muted">Sin eventos para esta unidad.</p> : (
        <ul className="plain-list">
          {evidence.map((e) => (
            <li key={e.id}>
              <span className="source-tag">{e.source}</span> <code>{e.id}</code> · {e.type === 'OBSERVATION' ? `observación en ${e.locationHintId}` : 'sin lectura'}
              <div className="muted small">Captura {e.capturedAt} · recepción {e.receivedAt}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
