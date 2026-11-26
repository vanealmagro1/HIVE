// Dashboard: indicadores, movimientos, mapa de bodega, actividad reciente y lo que requiere atención.
import { Archive, Bone, CircleDollarSign, Clock, MapPin, PackageSearch, Radio, TrendingUp, TriangleAlert, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ageDays } from '../../analytics/aging';
import { formatNumber, formatUsd } from '../../domain/format';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import { attentionItems, eventHistory, fmtDateTime, liveInventory, movementsByDay, occupancy, type AttentionItem } from '../../store/operations';
import { kpis } from '../../store/selectors';
import type { Actions } from '../actions';
import MovementsChart from '../charts/MovementsChart';
import { Chip, Kpi, PageHead } from '../layout/Shell';
import Warehouse2D from '../twin/Warehouse2D';
import AgingCard, { AgingChip } from '../AgingCard';

const ATTENTION_ICON = {
  location: { icon: MapPin, cls: 'kpi-icon amber' },
  verify: { icon: Clock, cls: 'kpi-icon blue' },
  receipt: { icon: PackageSearch, cls: 'kpi-icon amber' },
  stock: { icon: TrendingUp, cls: 'kpi-icon purple' },
  expiry: { icon: TriangleAlert, cls: 'kpi-icon amber' },
  aging: { icon: Bone, cls: 'kpi-icon red' },
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

/** Inventario contado en vivo: cada caja leída por el lector entra como fila nueva y los totales suben. */
function LiveCount({ state, actions }: { state: DemoState; actions: Actions }) {
  const inv = liveInventory(state);
  const time = (iso: string) => fmtDateTime(iso).split(', ')[1] ?? iso;
  return (
    <section className="card card-flush live-card" data-testid="live-count">
      <div className="card-head">
        <div>
          <h2 className="card-title">Inventario contado ahora</h2>
          <p className="card-sub">Sin reconteo manual: cada caja se suma en cuanto el lector lee su etiqueta.</p>
        </div>
        <Chip tone={LIVE_TONE[state.ui.live]}><Radio size={12} /> {LIVE_TEXT[state.ui.live]}</Chip>
      </div>
      <div className="live-totals">
        <div><span className="live-big" data-testid="live-boxes">{inv.countedBoxes}</span><span className="live-of"> de {inv.totalBoxes} cajas</span></div>
        <div><span className="live-big" data-testid="live-units">{formatNumber(inv.countedUnits)}</span><span className="live-of"> de {formatNumber(inv.totalUnits)} unidades</span></div>
        <div className="live-progress"><div className="bar"><span style={{ width: `${(inv.countedBoxes / inv.totalBoxes) * 100}%` }} /></div></div>
      </div>
      <table className="table live-table" data-testid="live-table">
        <thead><tr><th>Hora</th><th>Producto</th><th>Caja</th><th className="num">Cantidad</th><th>Ubicación leída</th><th>Tiempo en bodega</th><th>Estado</th></tr></thead>
        <tbody>
          {inv.rows.map((r) => (
            <tr key={r.eventId} className="row-live" onClick={() => actions.locateUnit(r.unitId)} style={{ cursor: 'pointer' }}>
              <td className="cell-date">{time(r.readAt)}</td>
              <td><span className="live-chiptag">{r.label}</span> <span className="cell-main">{r.product}</span></td>
              <td className="cell-sub">{r.unitId}</td>
              <td className="num"><strong>{formatNumber(r.qty)} u</strong></td>
              <td>{r.readLocation}{!r.ok && <div className="cell-sub">su lugar: {r.expectedLocation}</div>}</td>
              <td>{(() => { const u = state.units.find((x) => x.id === r.unitId); const d = u ? ageDays(u, state.referenceDate) : null; return d === null ? '—' : <AgingChip days={d} />; })()}</td>
              <td><Chip tone={r.ok ? 'ok' : 'bad'}>{r.ok ? '✓ Contada' : 'Fuera de lugar'}</Chip></td>
            </tr>
          ))}
          {inv.rows.length === 0 && <tr><td colSpan={7} className="empty">Esperando la primera lectura… acerca el lector a una caja.</td></tr>}
        </tbody>
      </table>
      {inv.pending.length > 0 && (
        <div className="live-pending" data-testid="live-pending">
          Pendiente{inv.pending.length > 1 ? 's' : ''}: {inv.pending.map((p) => `caja con etiqueta ${p.label}`).join(' · ')}
        </div>
      )}
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

      <AgingCard state={state} actions={actions} />

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
