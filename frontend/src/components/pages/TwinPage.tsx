// Gemelo digital: escena 3D propia de HIVE + ficha de la unidad + lista de inventario.
// Elegir un producto de la lista enfoca y resalta su pallet en el gemelo.
import { Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { formatNumber } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { fmtDateTime, verification } from '../../store/operations';
import { describeLocation, unitContents } from '../../store/selectors';
import type { Actions } from '../actions';
import { Chip, PageHead, productIcon } from '../layout/Shell';
import { searchInventory } from '../twin/search';

const EVIDENCE_BY = { SIMULATED: 'Escenario simulado', BLE: 'Beacon BLE', RFID_FUTURE: 'Lector RFID' } as const;

function UnitCard({ state, actions, onEvidence }: { state: DemoState; actions: Actions; onEvidence: (unitId: string) => void }) {
  const sel = state.units.find((u) => u.id === state.ui.selectedUnitId);
  const unit = sel?.parentId ? state.units.find((u) => u.id === sel.parentId) ?? sel : sel;
  if (!unit) {
    return (
      <section className="card" data-testid="unit-card">
        <h2 className="card-title">Unidad logística</h2>
        <p className="card-sub" style={{ marginTop: 8 }}>Selecciona un pallet en el modelo o en la lista para consultar su ficha.</p>
      </section>
    );
  }
  const c = unitContents(state, unit);
  const v = verification(unit);
  const Icon = productIcon(c.skuId);
  const last = state.events.find((e) => e.id === unit.lastEventId);
  return (
    <section className="card" data-testid="unit-card">
      <h2 className="card-title">Unidad logística</h2>
      <div className="product-row" style={{ marginTop: 12 }}>
        <span className="product-icon"><Icon size={20} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="product-name" data-testid="unit-title">{c.title}</div>
          <div className="product-sub">{c.skuId ?? `${c.lines.length} productos`} · {unit.id}</div>
        </div>
      </div>
      <dl className="unit-facts">
        <div><dt>Cantidad</dt><dd>{formatNumber(c.qty)} unidades</dd></div>
        <div><dt>Ubicación asignada</dt><dd>{unit.expectedLocationId}</dd></div>
        <div><dt>Ubicación registrada por</dt><dd>{last ? EVIDENCE_BY[last.source] : unit.lastObservedAt ? 'Barrido RFID' : '—'}</dd></div>
        <div><dt>Último evento</dt><dd>{unit.lastObservedAt ? fmtDateTime(unit.lastObservedAt) : '—'}</dd></div>
      </dl>
      {unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId && (
        <p className="note">Leído en <strong>{unit.observedLocationId}</strong> · {describeLocation(state, unit.observedLocationId)}</p>
      )}
      <Chip tone={v.tone}>{v.label}</Chip>
      <div className="unit-actions">
        <button type="button" className="btn btn-small" onClick={() => actions.setSection('inventario')}>Inventario</button>
        {c.skuId && <button type="button" className="btn btn-small" onClick={() => { actions.setSku(c.skuId!); actions.setSection('analitica'); }}>Analítica</button>}
        <button type="button" className="btn btn-small" onClick={() => onEvidence(unit.id)}>Evidencia</button>
      </div>
    </section>
  );
}

function StockList({ state, actions }: { state: DemoState; actions: Actions }) {
  const [q, setQ] = useState('');
  const roots = useMemo(() => state.units.filter((u) => !u.parentId && !u.expectedLocationId.startsWith('REC-')), [state.units]);
  const items = useMemo(() => {
    if (q.trim().length >= 2) return searchInventory(state, q, 60).map((h) => ({ id: h.unitId, title: h.title, loc: h.locationId }));
    return roots.slice(0, 40).map((u) => ({ id: u.id, title: unitContents(state, u).title, loc: u.expectedLocationId }));
  }, [q, roots, state]);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId);
  const selectedRoot = selected?.parentId ?? selected?.id;
  return (
    <section className="card" data-testid="stock-list">
      <h2 className="card-title">Buscar inventario</h2>
      <label className="input-search" style={{ marginTop: 12 }}>
        <Search size={15} aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Producto, SKU o ubicación" aria-label="Buscar en el gemelo" />
      </label>
      <ul className="stock-list">
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" className={selectedRoot === it.id ? 'is-on' : ''} onClick={() => actions.focusUnit(it.id)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="s-name">{it.title}</span><br />
                <span className="s-sub">{it.id} · {it.loc}</span>
              </span>
              {selectedRoot === it.id && <Chip tone="info">En foco</Chip>}
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="empty">Sin coincidencias.</li>}
      </ul>
    </section>
  );
}

export default function TwinPage({ state, actions, twin, onEvidence }: { state: DemoState; actions: Actions; twin: ReactNode; onEvidence: (unitId: string) => void }) {
  return (
    <div className="page" data-testid="page-gemelo">
      <PageHead state={state} title="Gemelo digital" sub="Localiza pallets, inspecciona racks y consulta la ubicación asignada." />
      <div className="grid-twin">
        <section className="card twin-page-card">
          <div className="card-head">
            <div><h2 className="card-title">Explorar bodega</h2><p className="card-sub">Arrastra para orbitar · usa la rueda para acercar · doble clic enfoca</p></div>
          </div>
          <div className="twin-frame">{twin}</div>
        </section>
        <div className="twin-side">
          <UnitCard state={state} actions={actions} onEvidence={onEvidence} />
          <StockList state={state} actions={actions} />
        </div>
      </div>
    </div>
  );
}
