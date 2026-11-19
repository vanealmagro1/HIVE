import { formatNumber, formatUsd } from '../../domain/format';
import { receiptShortage } from '../../engine/receiving';
import type { DemoState } from '../../store/demoState';
import { eventSourceLabel } from '../../store/selectors';
import type { Actions } from '../actions';

const time = (iso: string) => iso.slice(11, 19);

export default function RfidPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const po = state.purchaseOrders[0];
  const sku = po ? state.skus.find((s) => s.id === po.skuId) : undefined;
  const reads = [...state.events].reverse();
  const playing = state.ui.playback === 'DEMO_RECEIPT_001';
  const received = po?.receivedBoxIds.length ?? 0;
  const total = po?.boxes.length ?? 0;
  const shortage = po ? receiptShortage(state, po) : null;
  const unique = new Set(state.events.filter((e) => e.purchaseOrderId === po?.id).map((e) => e.epc)).size;

  return (
    <div data-testid="rfid-panel">
      <h2>Actividad RFID</h2>
      <p className="panel-intro">
        Cada caja lleva una etiqueta RFID. El portal del andén (lector fijo + 2 antenas) la lee al pasar, sin escanear
        una por una, y HIVE compara cada lectura con la orden de compra.
      </p>

      {po && (
        <article className="card" data-testid="receipt-card">
          <div className="rec-head">
            <span className="eyebrow">Recepción · {po.id}</span>
            <span className="pill">{po.status === 'CLOSED' ? 'CERRADA' : po.status === 'RECEIVING' ? 'LEYENDO…' : 'CAMIÓN EN ANDÉN'}</span>
          </div>
          <div className="rec-title">{sku?.name}</div>
          <div className="small muted">{po.supplier} · anuncia {total} cajas ({formatNumber(po.boxes.reduce((s, b) => s + b.qty, 0))} u)</div>
          <div className="feed-head">
            <div className="counter" data-testid="receipt-counter">{received}<small> / {total} cajas</small></div>
            <div className="progress" aria-hidden><span style={{ width: `${total ? (received / total) * 100 : 0}%` }} /></div>
          </div>
          <div className="small muted">{formatNumber(po.readCount)} lecturas · {unique} etiquetas distintas (las lecturas repetidas se cuentan una vez)</div>
          {po.status !== 'CLOSED' && (
            <div className="rec-actions">
              <button type="button" className="btn btn-primary" onClick={actions.startReception} disabled={playing}>
                {playing ? 'Leyendo etiquetas…' : '▶ Pasar pallet por el portal'}
              </button>
              <button type="button" className="btn" onClick={actions.completeReception}>Completar recepción</button>
            </div>
          )}
          {po.status === 'CLOSED' && shortage && (shortage.missing.length > 0 ? (
            <div className="result-box bad" data-testid="receipt-result">
              {received} de {total} cajas. Falta {shortage.missing.length === 1 ? '1 caja' : `${shortage.missing.length} cajas`} · {formatNumber(shortage.units)} u · {formatUsd(shortage.usd)}
              <div className="small">El inventario solo suma lo leído. Ver la alerta para reclamar al proveedor.</div>
            </div>
          ) : (
            <div className="result-box ok" data-testid="receipt-result">Recepción completa: {received} de {total} cajas.</div>
          ))}
        </article>
      )}

      <h3>Lecturas ({formatNumber(state.events.length)})</h3>
      {reads.length === 0 ? <p className="muted small">Aún no hay lecturas en esta sesión.</p> : (
        <ul className="feed" aria-label="Lecturas RFID">
          {reads.slice(0, 40).map((e, i) => {
            const dup = e.type === 'RECEIPT_READ' && state.events.findIndex((x) => x.epc === e.epc) !== state.events.indexOf(e);
            return (
              <li key={e.id} className={i === 0 && playing ? 'is-new' : undefined}>
                <span className="small">{time(e.capturedAt)}</span>
                <span>
                  <strong>{e.unitId}</strong> · {eventSourceLabel(e)}
                  {e.epc && <div className="epc">EPC {e.epc}</div>}
                </span>
                <span className="small muted">{dup ? 'repetida' : e.type === 'RECEIPT_READ' ? 'nueva' : e.type === 'MISSED_READ' ? 'sin respuesta' : `en ${e.locationHintId}`}</span>
              </li>
            );
          })}
        </ul>
      )}

      <h3>Equipos</h3>
      <ul className="plain-list small">
        <li>● <strong>Portal del andén</strong> (lector fijo + 2 antenas) · <span className="muted">simulado</span></li>
        <li>● <strong>Lector de mano RFID</strong> para conteos en pasillo · <span className="muted">simulado</span></li>
        <li>○ <strong>Beacons BLE de ubicación</strong> · <span className="muted">próxima etapa</span></li>
      </ul>
    </div>
  );
}
