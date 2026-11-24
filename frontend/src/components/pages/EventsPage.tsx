// Eventos: detecciones pendientes (recepción por portal RFID, conteo con lector de mano) e historial con evidencia.
import { Check, ScanLine } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber } from '../../domain/format';
import { receiptShortage } from '../../engine/receiving';
import { getScenario } from '../../engine/scenarios';
import type { DemoState } from '../../store/demoState';
import { EVENT_KINDS, eventHistory, fmtDateTime, type HistoryRow } from '../../store/operations';
import { COUNT_SCENARIO_ID, DEMO_EVENT_ID, RECEIPT_SCENARIO_ID } from '../../store/selectors';
import type { Actions } from '../actions';
import { Chip, PageHead } from '../layout/Shell';

const PAGE = 12;

function DetectionBanner({ state, actions }: { state: DemoState; actions: Actions }) {
  const po = state.purchaseOrders[0];
  const playing = state.ui.playback;
  const sku = state.skus.find((k) => k.id === po.skuId)?.name ?? po.skuId;
  const counted = state.events.some((e) => e.id === DEMO_EVENT_ID) && playing !== COUNT_SCENARIO_ID;

  if (playing === RECEIPT_SCENARIO_ID || po.status === 'RECEIVING') {
    return (
      <div className="banner" data-testid="detection-banner">
        <div className="banner-text">
          <strong>Leyendo etiquetas en el portal RFID…</strong> {po.receivedBoxIds.length} de {po.boxes.length} cajas de {po.id}.
          <div className="bar"><span style={{ width: `${(po.receivedBoxIds.length / po.boxes.length) * 100}%` }} /></div>
        </div>
        <button type="button" className="btn btn-small" onClick={actions.completeReception}>Procesar todo</button>
      </div>
    );
  }
  if (po.status !== 'CLOSED') {
    return (
      <div className="banner" data-testid="detection-banner">
        <div className="banner-text">
          <strong>{po.palletId}</strong> detectado en el muelle virtual: {po.boxes.length} cajas de {sku} ({po.id}).
          Confirma el ingreso para leer cada caja y sumarla al stock.
        </div>
        <button type="button" className="btn btn-small" onClick={actions.runDemoEvent} disabled={counted || !!playing}>Registrar otra detección</button>
      </div>
    );
  }
  if (playing === COUNT_SCENARIO_ID) {
    const total = getScenario(COUNT_SCENARIO_ID).events.length;
    const done = getScenario(COUNT_SCENARIO_ID).events.filter((e) => state.events.some((x) => x.id === e.id)).length;
    return (
      <div className="banner" data-testid="detection-banner">
        <div className="banner-text">
          <strong>Conteo con lector de mano · pasillo D…</strong> {done} de {total} etiquetas.
          <div className="bar"><span style={{ width: `${(done / total) * 100}%` }} /></div>
        </div>
        <button type="button" className="btn btn-small" onClick={actions.completeCount}>Procesar todo</button>
      </div>
    );
  }
  const sh = receiptShortage(state, po);
  const received = po.boxes.filter((b) => po.receivedBoxIds.includes(b.boxId)).reduce((t, b) => t + b.qty, 0);
  if (!counted) {
    return (
      <div className={`banner${sh.missing.length ? ' warn' : ' ok'}`} data-testid="detection-banner">
        <div className="banner-text" data-testid="receipt-result">
          <strong>Ingreso confirmado:</strong> {po.receivedBoxIds.length} de {po.boxes.length} cajas · {formatNumber(received)} u sumadas al stock.
          {sh.missing.length > 0 && <> Falta {sh.missing.length} caja ({formatNumber(sh.units)} u): queda como alerta.</>}
        </div>
        <button type="button" className="btn btn-small btn-soft" onClick={actions.runDemoEvent}><ScanLine size={14} /> Registrar otra detección</button>
      </div>
    );
  }
  const ev = state.events.find((e) => e.id === DEMO_EVENT_ID);
  const unit = state.units.find((u) => u.id === ev?.unitId);
  const root = unit?.parentId ? state.units.find((u) => u.id === unit.parentId) : unit;
  return (
    <div className="banner ok" data-testid="detection-banner">
      <div className="banner-text" data-testid="new-evidence">
        <Check size={15} style={{ verticalAlign: -2 }} /> Sin detecciones pendientes. Última: <strong>{root?.id}</strong> leído en {ev?.locationHintId} (asignado a {root?.expectedLocationId}).
      </div>
      {root && <button type="button" className="btn btn-small" onClick={() => actions.locateUnit(root.id)}>Ver en gemelo</button>}
    </div>
  );
}

export default function EventsPage({ state, actions, onEvidence }: { state: DemoState; actions: Actions; onEvidence: (row: HistoryRow) => void }) {
  const [kind, setKind] = useState('ALL');
  const [page, setPage] = useState(0);
  const rows = useMemo(() => eventHistory(state), [state.events, state.movements, state.purchaseOrders, state.alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = rows.filter((r) => kind === 'ALL' || r.kind === kind);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const po = state.purchaseOrders[0];

  return (
    <div className="page" data-testid="page-eventos">
      <PageHead state={state} title="Eventos" sub="Revisa detecciones y movimientos confirmados.">
        <button type="button" className="btn btn-primary" onClick={actions.startReception} disabled={po.status === 'CLOSED' || !!state.ui.playback}>
          <Check size={16} /> Confirmar ingreso
        </button>
      </PageHead>
      <DetectionBanner state={state} actions={actions} />
      <section className="card card-flush">
        <div className="card-head" style={{ paddingBottom: 14 }}>
          <div><h2 className="card-title">Historial de eventos</h2><p className="card-sub">Recepciones, observaciones y traslados con su evidencia</p></div>
        </div>
        <div className="toolbar">
          <select className="select" value={kind} aria-label="Filtrar por tipo" onChange={(e) => { setKind(e.target.value); setPage(0); }}>
            <option value="ALL">Todos los tipos</option>
            {EVENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <table className="table" data-testid="events-table">
          <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Unidad logística</th><th>Origen</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {filtered.slice(cur * PAGE, cur * PAGE + PAGE).map((r) => (
              <tr key={r.id} className={r.live ? 'row-live' : undefined}>
                <td className="cell-date">{fmtDateTime(r.at)}</td>
                <td><div className="ev-type">{r.kind}</div><div className="cell-sub">{r.ref}</div></td>
                <td><div className="cell-main">{r.unitLabel}</div><div className="cell-sub">{r.product}</div></td>
                <td><Chip tone={r.live ? 'info' : 'sim'}>{r.origin}</Chip></td>
                <td><Chip tone={r.status.tone}>{r.status.label}</Chip></td>
                <td className="row-actions"><button type="button" className="btn btn-small" onClick={() => onEvidence(r)}>Evidencia</button></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="empty">Sin eventos de este tipo.</td></tr>}
          </tbody>
        </table>
        <div className="table-foot">
          <span>{formatNumber(filtered.length)} eventos · página {cur + 1} de {pages}</span>
          <span>
            <button type="button" className="btn btn-small" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Anterior</button>
            <button type="button" className="btn btn-small" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Siguiente</button>
          </span>
        </div>
      </section>
    </div>
  );
}
