import { useMemo, useState } from 'react';
import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { skuOfUnit } from '../../store/selectors';
import type { Actions } from '../actions';

const PAGE = 20;

/** Zona de almacenamiento de cada familia de productos (prefijo del SKU). */
const FAMILY_ZONE: Record<string, string> = {
  CUA: 'Z-A', ESC: 'Z-A', ART: 'Z-A', UTI: 'Z-A', MOC: 'Z-A',
  TEC: 'Z-B', ACC: 'Z-B', CAL: 'Z-B',
  RES: 'Z-C', OFI: 'Z-C', TIN: 'Z-C',
};

export default function InventoryPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('ALL');
  const [page, setPage] = useState(0);
  const rows = useMemo(() => (actions.api.getInventory().data ?? []).sort((a, b) => b.valueUsd - a.valueUsd), [actions, state.units]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalUnits = rows.reduce((s, r) => s + r.stockBaseUnits, 0);
  const totalValue = rows.reduce((s, r) => s + r.valueUsd, 0);
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => (zone === 'ALL' || FAMILY_ZONE[r.skuId.slice(0, 3)] === zone)
    && (!q || r.skuName.toLowerCase().includes(q) || r.skuId.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId);
  const selectedSku = selected ? skuOfUnit(state, selected)?.id : undefined;

  const openSku = (skuId: string) => {
    const lots = new Set(state.lots.filter((l) => l.skuId === skuId).map((l) => l.id));
    const unit = state.units.find((u) => !u.parentId && u.lotId && lots.has(u.lotId));
    if (unit) { actions.select(unit.id); actions.setView('twin'); }
  };

  return (
    <div data-testid="inventory-panel">
      <h2>Inventario</h2>
      <p className="panel-intro">
        {formatNumber(rows.length)} productos · {formatNumber(totalUnits)} unidades · {formatUsd(totalValue)} a costo.
        Cada caja lleva una etiqueta RFID; el stock suma cajas y nunca vuelve a sumar el pallet.
      </p>
      <div className="filters">
        <input className="input" type="search" placeholder="Buscar producto o código…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} aria-label="Buscar producto" />
        <select className="input" style={{ flex: 'none' }} value={zone} onChange={(e) => { setZone(e.target.value); setPage(0); }} aria-label="Filtrar por zona">
          <option value="ALL">Todas las zonas</option>
          {state.zones.filter((z) => z.kind !== 'RECEIVING').map((z) => <option key={z.id} value={z.id}>{z.name} · {z.category}</option>)}
        </select>
      </div>
      <table className="table">
        <thead>
          <tr><th>Producto</th><th className="num">Stock</th><th className="num">Valor</th><th>Vence</th></tr>
        </thead>
        <tbody>
          {filtered.slice(current * PAGE, current * PAGE + PAGE).map((r) => (
            <tr key={r.skuId} className={selectedSku === r.skuId ? 'is-selected-row' : undefined}>
              <td>
                <button type="button" className="link-btn" onClick={() => openSku(r.skuId)}>{r.skuName}</button>
                <div className="muted small">{r.skuId} · {formatUsd(r.unitCost)}/u</div>
              </td>
              <td className="num">{formatNumber(r.stockBaseUnits)}</td>
              <td className="num">{formatUsd(r.valueUsd)}</td>
              <td className="small">{r.lots.map((l) => l.expiryDate).filter(Boolean).join(', ') || '—'}</td>
            </tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={4} className="muted">Sin resultados.</td></tr>}
        </tbody>
      </table>
      <div className="pager">
        <span>{filtered.length} resultados · página {current + 1} de {pages}</span>
        <span>
          <button type="button" className="btn btn-small" disabled={current === 0} onClick={() => setPage(current - 1)}>◀</button>{' '}
          <button type="button" className="btn btn-small" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>▶</button>
        </span>
      </div>
    </div>
  );
}
