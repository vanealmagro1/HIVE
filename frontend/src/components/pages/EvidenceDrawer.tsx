// Detalle de evidencia de una unidad logística o de un registro del historial.
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { formatNumber } from '../../domain/format';
import { LAST_RFID_SWEEP } from '../../seed/generator';
import type { DemoState } from '../../store/demoState';
import { fmtDateTime, verification, type HistoryRow } from '../../store/operations';
import { describeLocation, eventSourceLabel, unitContents } from '../../store/selectors';
import { Chip } from '../layout/Shell';

export type EvidenceTarget = { unitId: string } | { row: HistoryRow };

export default function EvidenceDrawer({ state, target, onClose }: { state: DemoState; target: EvidenceTarget | null; onClose: () => void }) {
  useEffect(() => {
    if (!target) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);
  if (!target) return null;

  const row = 'row' in target ? target.row : null;
  const unitId = 'unitId' in target ? target.unitId : row?.unitId ?? null;
  const unit = state.units.find((u) => u.id === unitId) ?? null;
  const kids = unit ? new Set(state.units.filter((u) => u.parentId === unit.id).map((u) => u.id)) : new Set<string>();
  const ids = new Set(row?.eventIds ?? []);
  const events = state.events.filter((e) => ids.has(e.id) || (unit && (e.unitId === unit.id || kids.has(e.unitId))));
  const c = unit ? unitContents(state, unit) : null;
  const v = unit ? verification(unit) : null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Evidencia" data-testid="evidence-drawer">
        <div className="drawer-head">
          <h2>Evidencia{unit ? ` · ${unit.id}` : row ? ` · ${row.ref}` : ''}</h2>
          <button type="button" className="round-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Cerrar evidencia"><X size={18} /></button>
        </div>
        <div className="drawer-body">
          {row && (
            <dl className="kv">
              <dt>Evento</dt><dd><strong>{row.kind}</strong> · {row.ref}</dd>
              <dt>Fecha</dt><dd>{fmtDateTime(row.at)}</dd>
              <dt>Estado</dt><dd><Chip tone={row.status.tone}>{row.status.label}</Chip></dd>
              <dt>Detalle</dt><dd>{row.note}</dd>
            </dl>
          )}
          {unit && c && v && (
            <dl className="kv">
              <dt>Producto</dt><dd><strong>{c.title}</strong>{c.skuId ? ` · ${c.skuId}` : ''}</dd>
              <dt>Cantidad</dt><dd>{formatNumber(c.qty)} u{kids.size ? ` en ${kids.size} cajas etiquetadas` : ''}</dd>
              <dt>Ubicación asignada</dt><dd>{describeLocation(state, unit.expectedLocationId)}</dd>
              <dt>Última lectura</dt><dd>{unit.observedLocationId ? describeLocation(state, unit.observedLocationId) : 'Sin lectura'}</dd>
              <dt>Verificación</dt><dd><Chip tone={v.tone}>{v.label}</Chip></dd>
            </dl>
          )}
          <h3>Lecturas</h3>
          {events.length ? (
            <ul className="timeline">
              {events.slice(-40).reverse().map((e) => (
                <li key={e.id}>
                  <span className="source-tag">SIMULADO</span> {eventSourceLabel(e)} · {e.type === 'OBSERVATION' ? `en ${e.locationHintId}` : e.type === 'MISSED_READ' ? 'sin respuesta' : `recepción ${e.purchaseOrderId ?? ''}`}
                  <div className="muted small">{fmtDateTime(e.capturedAt)} · {e.unitId}{e.epc ? ` · EPC ${e.epc}` : ''}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">
              {unit?.lastObservedAt ? `Leído en el barrido RFID del ${fmtDateTime(LAST_RFID_SWEEP)} en su ubicación asignada.` : 'Este registro no tiene lecturas individuales asociadas.'}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
