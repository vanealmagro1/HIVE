import { unitDetail } from '../../domain/inventory';
import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { describeLocation, eventSourceLabel, STATUS_ICON, STATUS_LABEL } from '../../store/selectors';
import type { Actions } from '../actions';

export default function UnitPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const id = state.ui.selectedUnitId;
  const detail = id ? unitDetail(state.units, state.lots, state.skus, id) : null;
  if (!detail) {
    const pallets = state.units.filter((u) => u.type === 'PALLET').length;
    const boxes = state.units.filter((u) => u.type === 'BOX').length;
    return (
      <div className="panel-empty">
        <h2>Detalle</h2>
        <p>Haga clic en un pallet de la bodega para ver qué contiene, dónde está registrado y su última lectura RFID.</p>
        <p className="muted small">{pallets} pallets y {boxes} cajas con etiqueta RFID en {state.zones.length} zonas y {state.locations.length} ubicaciones.</p>
      </div>
    );
  }
  const { unit, lot, sku, children } = detail;
  const evidence = state.events.filter((e) => e.unitId === unit.id || (unit.parentId && e.unitId === unit.parentId));
  const mismatch = unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId;

  return (
    <div className="unit-panel" data-testid="unit-panel">
      <div className="eyebrow">{unit.type === 'PALLET' ? 'Pallet' : 'Caja'} con etiqueta RFID</div>
      <h2>{unit.type === 'PALLET' ? 'Pallet' : 'Caja'} {unit.id}</h2>
      <div className={`status-badge status-${unit.verificationStatus}`}>
        {STATUS_ICON[unit.verificationStatus]} {STATUS_LABEL[unit.verificationStatus]}
      </div>
      <dl className="kv">
        <dt>Producto</dt><dd>{sku ? <><strong>{sku.name}</strong> <span className="muted">· {sku.id}</span></> : '—'}</dd>
        <dt>Cantidad</dt>
        <dd>
          {formatNumber(unit.quantityBaseUnits)} u
          {unit.type === 'PALLET' && children.length > 0 && <span className="muted"> en {children.length} cajas</span>}
        </dd>
        <dt>Valor</dt><dd>{sku ? `${formatUsd(unit.quantityBaseUnits * sku.unitCost)} (${formatUsd(sku.unitCost)} / u)` : '—'}</dd>
        <dt>Lote · vence</dt><dd>{lot?.id ?? '—'} · {lot?.expiryDate ?? 'Sin caducidad'}</dd>
        <dt>Ubicación registrada</dt><dd><strong>{describeLocation(state, unit.expectedLocationId)}</strong></dd>
        <dt>Última lectura</dt>
        <dd className={mismatch ? 'text-warn' : undefined}>
          {!unit.observedLocationId ? 'Sin lecturas registradas'
            : mismatch ? `${describeLocation(state, unit.observedLocationId)} · distinta de la registrada`
              : '✔ En su ubicación registrada'}
          {unit.lastObservedAt && <div className="muted small">{unit.lastObservedAt}</div>}
        </dd>
      </dl>
      {children.length > 0 && (
        <details>
          <summary>Cajas del pallet ({children.length})</summary>
          <ul className="plain-list small">
            {children.map((c) => (
              <li key={c.id}>
                <button type="button" className="link-btn" onClick={() => actions.select(c.id)}>{c.id}</button>
                {' '}· {formatNumber(c.quantityBaseUnits)} u · {STATUS_LABEL[c.verificationStatus]}
              </li>
            ))}
          </ul>
          <p className="muted small">El stock se calcula sumando las cajas; el pallet no se vuelve a sumar.</p>
        </details>
      )}
      {unit.parentId && (
        <p>Pertenece a <button type="button" className="link-btn" onClick={() => actions.select(unit.parentId!)}>{unit.parentId}</button></p>
      )}
      <h3>Lecturas</h3>
      {evidence.length === 0 ? <p className="muted small">Sin lecturas registradas en esta sesión.</p> : (
        <ul className="plain-list small">
          {evidence.map((e) => (
            <li key={e.id}>
              <span className="source-tag">{e.source}</span> {eventSourceLabel(e)} · {e.type === 'OBSERVATION' ? `leído en ${e.locationHintId}` : 'sin respuesta'}
              <div className="muted">{e.capturedAt} · <code>{e.id}</code></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
