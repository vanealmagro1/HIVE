// Dashboard: indicadores, movimientos, mapa de bodega, actividad reciente y lo que requiere atención.
import { Archive, CircleDollarSign, Clock, MapPin, PackageSearch, Radio, TrendingUp, TriangleAlert, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber, formatUsd } from '../../domain/format';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import { attentionItems, beaconCount, eventHistory, fmtDateTime, movementsByDay, occupancy, verification, type AttentionItem } from '../../store/operations';
import { BEACON_BOXES } from '../../seed/seed';
import { kpis, unitContents } from '../../store/selectors';
import type { Actions } from '../actions';
import MovementsChart from '../charts/MovementsChart';
import { Chip, Kpi, PageHead } from '../layout/Shell';
import Warehouse2D from '../twin/Warehouse2D';

const ATTENTION_ICON = {
  location: { icon: MapPin, cls: 'kpi-icon amber' },
  verify: { icon: Clock, cls: 'kpi-icon blue' },
  receipt: { icon: PackageSearch, cls: 'kpi-icon amber' },
  stock: { icon: TrendingUp, cls: 'kpi-icon purple' },
  expiry: { icon: TriangleAlert, cls: 'kpi-icon amber' },
} as const;

export function AttentionList({ items, actions }: { items: AttentionItem[]; actions: Actions }) {
  if (!items.length) return <p className="empty">Todo en orden: no hay alertas abiertas.</p>;
  const open = (it: AttentionItem) => {
    if (it.unitId) actions.locateUnit(it.unitId);
    else if (it.skuId) { actions.setSku(it.skuId); actions.setSection('acciones'); }
  };
  return (
    <ul className="attention" data-testid="attention-list">
      {items.map((it) => {
        const { icon: Icon, cls } = ATTENTION_ICON[it.kind];
        return (
          <li key={it.id}>
            <span className={`a-icon ${cls}`}><Icon size={16} /></span>
            <div className="a-body"><div className="a-title">{it.title}</div><div className="a-desc">{it.desc}</div></div>
            <button type="button" className="btn btn-small" onClick={() => open(it)}>Ver</button>
          </li>
        );
      })}
    </ul>
  );
}

const LIVE_TEXT = { off: 'Lector en vivo apagado', connecting: 'Conectando lector…', connected: 'Lector en vivo · conectado', offline: 'Lector sin conexión' } as const;
const LIVE_TONE = { off: 'sim', connecting: 'warn', connected: 'ok', offline: 'bad' } as const;

/** Conteo automático: las cajas con beacon pasan a "Verificada" en cuanto el lector las lee. */
function LiveCount({ state, actions }: { state: DemoState; actions: Actions }) {
  const c = beaconCount(state);
  return (
    <section className="card live-card" data-testid="live-count">
      <div className="card-head">
        <div>
          <h2 className="card-title">Conteo automático · cajas con etiqueta</h2>
          <p className="card-sub">Sin reconteo manual: el lector verifica cada caja en segundos.</p>
        </div>
        <Chip tone={LIVE_TONE[state.ui.live]}><Radio size={12} /> {LIVE_TEXT[state.ui.live]}</Chip>
      </div>
      <div className="live-body">
        <div className="live-total">
          <div className="live-big" data-testid="live-verified">{c.verified} <span>de {c.total}</span></div>
          <div className="kpi-caption">cajas verificadas hoy{c.misplaced ? ` · ${c.misplaced} fuera de lugar` : ''}</div>
          <div className="bar"><span style={{ width: `${(c.verified / c.total) * 100}%` }} /></div>
          <div className="kpi-caption">{c.lastAt ? `Última lectura: beacon ${c.lastLabel} · ${fmtDateTime(c.lastAt)}` : 'Esperando la primera lectura…'}</div>
        </div>
        <div className="live-boxes">
          {BEACON_BOXES.map((b) => {
            const u = state.units.find((x) => x.id === b.unitId);
            if (!u) return null;
            const v = verification(u);
            const read = state.events.some((e) => e.source === 'BLE' && e.unitId === u.id);
            const tone = !read ? 'sim' : v.tone;
            return (
              <button key={`${b.unitId}-${read}`} type="button" className={`live-box tone-${tone}${read ? ' is-read' : ' is-hidden'}`}
                onClick={read ? () => actions.locateUnit(u.id) : undefined} data-testid={`live-box-${b.label}`}>
                <span className="live-tag">{read ? b.label : '?'}</span>
                {/* El producto se revela solo cuando el lector lee la etiqueta. */}
                <span className="live-info">
                  <strong>{read ? unitContents(state, u).title : 'Caja por leer'}</strong>
                  <span>{read ? `${u.id} · ${u.expectedLocationId}` : `Etiqueta ${b.label} · acerca el lector`}</span>
                </span>
                <Chip tone={tone}>{!read ? 'Sin lectura' : v.tone === 'ok' ? 'Verificada' : 'Fuera de lugar'}</Chip>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage({ state, actions }: { state: DemoState; actions: Actions }) {
  const [days, setDays] = useState(7);
  const k = kpis(state, computeAnalytics(state));
  const occ = occupancy(state);
  const attention = attentionItems(state);
  const history = useMemo(() => eventHistory(state), [state.events, state.movements, state.purchaseOrders, state.alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const moves = movementsByDay(state, days);
  const noRisk = useMemo(() => new Set<string>(), []);
  const po = state.purchaseOrders[0];

  return (
    <div className="page" data-testid="page-dashboard">
      <PageHead state={state} title="Dashboard" sub="Indicadores, movimientos y alertas de la bodega seleccionada.">
        <button type="button" className="btn btn-primary" disabled={po?.status === 'CLOSED' || !!state.ui.playback}
          onClick={() => { actions.startReception(); actions.setSection('eventos'); }}>
          Simular recepción
        </button>
      </PageHead>

      <LiveCount state={state} actions={actions} />

      <section className="kpis" aria-label="Indicadores">
        <Kpi label="Unidades registradas" value={formatNumber(k.units)} caption="Stock actual" icon={Archive} testId="kpi-units" />
        <Kpi label="Ocupación" value={`${formatNumber(occ.pct, 1)} %`} caption={`${formatNumber(occ.used)} de ${formatNumber(occ.total)} ubicaciones`} icon={Warehouse} tone="blue" testId="kpi-occupancy" />
        <Kpi label="Alertas activas" value={String(attention.length)} caption="Ver causas y evidencia" icon={TriangleAlert} tone="amber" testId="kpi-alerts"
          onCaption={() => document.getElementById('attention')?.scrollIntoView({ behavior: 'smooth' })} />
        <Kpi label="Exposición estimada" value={formatUsd(k.exposure)} caption="Por excedente de stock" icon={CircleDollarSign} tone="green" testId="kpi-exposure" />
      </section>

      <div className="grid-2-1">
        <section className="card">
          <div className="card-head">
            <div><h2 className="card-title">Movimientos de inventario</h2><p className="card-sub">Unidades por operación confirmada</p></div>
            <div className="seg-tabs" role="radiogroup" aria-label="Periodo">
              {[7, 14].map((d) => <button key={d} type="button" role="radio" aria-checked={days === d} className={days === d ? 'is-on' : ''} onClick={() => setDays(d)}>{d} días</button>)}
            </div>
          </div>
          <MovementsChart data={moves} />
        </section>
        <section className="card">
          <div className="card-head">
            <div><h2 className="card-title">Mapa de bodega</h2><p className="card-sub">Ubicaciones asignadas · {state.warehouse.id}</p></div>
            <button type="button" className="btn btn-small" onClick={() => actions.setSection('gemelo')}>Abrir gemelo</button>
          </div>
          <div className="mini-map" onClick={() => actions.setSection('gemelo')} aria-hidden>
            <Warehouse2D state={state} expiryRiskLots={noRisk} onSelect={() => undefined} />
            <span className="mini-map-hint"><Chip tone="info">Plano por ubicación</Chip></span>
          </div>
        </section>
      </div>

      <div className="grid-2-1">
        <section className="card card-flush">
          <div className="card-head">
            <div><h2 className="card-title">Actividad reciente</h2><p className="card-sub">Últimos registros de esta bodega</p></div>
            <button type="button" className="btn btn-small" onClick={() => actions.setSection('eventos')}>Todos los eventos</button>
          </div>
          <table className="table">
            <thead><tr><th>Evento</th><th>Producto</th><th>Fecha</th><th>Origen</th></tr></thead>
            <tbody>
              {history.slice(0, 5).map((r) => (
                <tr key={r.id} className={r.live ? 'row-live' : undefined} onClick={r.unitId ? () => actions.locateUnit(r.unitId!) : undefined} style={r.unitId ? { cursor: 'pointer' } : undefined}>
                  <td><div className="ev-type">{r.kind}</div><div className="cell-sub">{r.unitLabel}</div></td>
                  <td>{r.product}{r.live && <div className="cell-sub">{r.status.label}</div>}</td>
                  <td className="cell-date">{fmtDateTime(r.at)}</td>
                  <td><Chip tone={r.live ? 'info' : 'sim'}>{r.origin}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card" id="attention">
          <div className="card-head"><div><h2 className="card-title">Requiere atención</h2><p className="card-sub">Alertas de ubicación, verificación y cobertura</p></div></div>
          <AttentionList items={attention} actions={actions} />
        </section>
      </div>
    </div>
  );
}
