import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { STATUS_ICON, STATUS_LABEL, skuOfUnit } from '../../store/selectors';
import type { Actions } from '../actions';

export default function InventoryPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const rows = actions.api.getInventory().data ?? [];
  const totalUnits = rows.reduce((s, r) => s + r.stockBaseUnits, 0);
  const totalValue = rows.reduce((s, r) => s + r.valueUsd, 0);
  const pallets = state.units.filter((u) => u.type === 'PALLET');

  return (
    <div data-testid="inventory-panel">
      <h2>Inventario</h2>
      <p className="panel-intro">Stock registrado por producto. Cada caja lleva una etiqueta RFID; el stock suma cajas y nunca vuelve a sumar el pallet.</p>
      <table className="table">
        <thead>
          <tr><th>Producto</th><th className="num">Stock (u)</th><th className="num">Costo</th><th className="num">Valor</th><th>Lotes · venc.</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.skuId}>
              <td><strong>{r.skuName}</strong><div className="muted small">{r.skuId}</div></td>
              <td className="num">{formatNumber(r.stockBaseUnits)}</td>
              <td className="num">{formatUsd(r.unitCost)}</td>
              <td className="num">{formatUsd(r.valueUsd)}</td>
              <td className="small">{r.lots.map((l) => `${l.lotId}${l.expiryDate ? ` · ${l.expiryDate}` : ''}`).join(', ')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Total</td><td className="num">{formatNumber(totalUnits)}</td><td /><td className="num">{formatUsd(totalValue)}</td><td /></tr>
        </tfoot>
      </table>

      <h3>Pallets</h3>
      <table className="table">
        <thead><tr><th>Pallet</th><th>Producto · lote</th><th className="num">u</th><th>Ubicación</th><th>Estado RFID</th></tr></thead>
        <tbody>
          {pallets.map((p) => (
            <tr key={p.id} className={state.ui.selectedUnitId === p.id ? 'is-selected-row' : undefined}>
              <td><button type="button" className="link-btn" onClick={() => { actions.select(p.id); actions.setView('twin'); }}>{p.id}</button></td>
              <td className="small">{skuOfUnit(state, p)?.id} · {p.lotId}</td>
              <td className="num">{p.quantityBaseUnits}</td>
              <td>{p.expectedLocationId}{p.observedLocationId && p.observedLocationId !== p.expectedLocationId && <div className="text-warn small">leído en {p.observedLocationId}</div>}</td>
              <td className="small">{STATUS_ICON[p.verificationStatus]} {STATUS_LABEL[p.verificationStatus]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
