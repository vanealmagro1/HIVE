// Inventario: existencias por unidad logística y su estado de verificación.
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { verification, VERIFICATION_FILTERS } from '../../store/operations';
import { unitContents } from '../../store/selectors';
import type { Actions } from '../actions';
import { Chip, PageHead } from '../layout/Shell';

const PAGE = 12;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function InventoryPage({ state, actions, onEvidence }: { state: DemoState; actions: Actions; onEvidence: (unitId: string) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const rows = useMemo(() => state.units
    .filter((u) => !u.parentId && !u.expectedLocationId.startsWith('REC-'))
    .map((u) => ({ unit: u, c: unitContents(state, u), v: verification(u) })), [state]);
  const nq = norm(q.trim());
  const filtered = rows.filter((r) => (filter === 'ALL' || r.v.label === filter)
    && (!nq || norm(`${r.c.title} ${r.c.skuId ?? ''} ${r.unit.id} ${r.unit.expectedLocationId}`).includes(nq)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId);
  const selectedRoot = selected?.parentId ?? selected?.id;
  const units = filtered.reduce((t, r) => t + r.c.qty, 0);

  return (
    <div className="page" data-testid="page-inventario">
      <PageHead state={state} title="Inventario" sub="Consulta existencias por unidad logística y su estado de verificación." />
      <section className="card card-flush">
        <div className="card-head" style={{ paddingBottom: 14 }}>
          <div><h2 className="card-title">Unidades logísticas</h2><p className="card-sub">{formatNumber(filtered.length)} unidades · {formatNumber(units)} productos en stock</p></div>
        </div>
        <div className="toolbar">
          <label className="input-search">
            <Search size={15} aria-hidden />
            <input type="search" value={q} placeholder="Buscar producto, SKU o pallet" aria-label="Buscar producto"
              onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </label>
          <select className="select" value={filter} aria-label="Filtrar por verificación" onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
            <option value="ALL">Toda verificación</option>
            {VERIFICATION_FILTERS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <table className="table" data-testid="inventory-table">
          <thead><tr><th>Producto / SKU</th><th className="num">Cantidad</th><th>Ubicación asignada</th><th>Verificación</th><th /></tr></thead>
          <tbody>
            {filtered.slice(cur * PAGE, cur * PAGE + PAGE).map(({ unit, c, v }) => (
              <tr key={unit.id} className={selectedRoot === unit.id ? 'is-selected-row' : undefined}>
                <td><div className="cell-main">{c.title}</div><div className="cell-sub">{c.skuId ?? `${c.lines.length} productos`} · {unit.id}</div></td>
                <td className="num">{formatNumber(c.qty)} uds.</td>
                <td>{unit.expectedLocationId}{v.tone === 'bad' && <div className="cell-sub">leído en {unit.observedLocationId}</div>}</td>
                <td><Chip tone={v.tone}>{v.label}</Chip></td>
                <td className="row-actions">
                  <button type="button" className="btn btn-small" onClick={() => actions.locateUnit(unit.id)}>Ver en gemelo</button>
                  <button type="button" className="btn btn-small" onClick={() => onEvidence(unit.id)}>Evidencia</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="empty">Sin resultados.</td></tr>}
          </tbody>
        </table>
        <div className="table-foot">
          <span>Página {cur + 1} de {pages}</span>
          <span>
            <button type="button" className="btn btn-small" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Anterior</button>
            <button type="button" className="btn btn-small" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Siguiente</button>
          </span>
        </div>
      </section>
    </div>
  );
}
