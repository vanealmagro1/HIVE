// Motor de eventos y conciliación supervisada.
// Principios:
//  - Idempotencia: un evento con ID ya procesado no tiene efecto (ni evento, ni discrepancia, ni alerta duplicada).
//  - Una observación NO confirma ubicación física: solo se registra como evidencia (observedLocationId).
//  - expectedLocationId nunca se modifica automáticamente; tampoco el stock.
//  - Ausencia de lectura => PENDIENTE DE VERIFICACIÓN, nunca pérdida confirmada.
//  - Una lectura de pallet no verifica individualmente sus cajas.
import type { Alert, Discrepancy, EventSource, InventoryEvent, Recommendation } from '../domain/types';
import { appendAudit, type DemoState } from '../store/demoState';

export type ProcessOutcome = 'APPLIED' | 'DUPLICATE' | 'REJECTED';

export interface ProcessResult { state: DemoState; outcome: ProcessOutcome; message: string }

const SOURCES: EventSource[] = ['SIMULATED', 'BLE', 'RFID_FUTURE'];

export function validateEvent(state: DemoState, event: InventoryEvent): string | null {
  if (!event.id?.trim()) return 'El evento requiere un ID estable.';
  if (!SOURCES.includes(event.source)) return `Fuente desconocida: ${String(event.source)}`;
  if (event.type !== 'OBSERVATION' && event.type !== 'MISSED_READ') return `Tipo de evento desconocido: ${String(event.type)}`;
  if (!state.units.some((u) => u.id === event.unitId)) return `Unidad inexistente: ${event.unitId}`;
  if (event.type === 'OBSERVATION') {
    if (!event.locationHintId) return 'Una observación requiere indicio de ubicación.';
    if (!state.locations.some((l) => l.id === event.locationHintId)) return `Ubicación inexistente: ${event.locationHintId}`;
  }
  if (!event.capturedAt || !event.receivedAt) return 'El evento requiere hora de captura y de recepción.';
  return null;
}

const suffixOf = (eventId: string): string => eventId.replace(/^evt-/, '');

export function processEvent(state: DemoState, event: InventoryEvent): ProcessResult {
  if (state.events.some((e) => e.id === event.id)) {
    const message = `Evento ${event.id} ya procesado: reenvío ignorado (idempotente).`;
    return { state: { ...state, audit: appendAudit(state, message), lastMessage: { kind: 'warning', text: message } }, outcome: 'DUPLICATE', message };
  }
  const error = validateEvent(state, event);
  if (error) {
    return { state: { ...state, lastMessage: { kind: 'error', text: error } }, outcome: 'REJECTED', message: error };
  }

  const unit = state.units.find((u) => u.id === event.unitId)!;
  const openDisc = state.discrepancies.find((d) => d.unitId === unit.id && d.status === 'PENDING_VERIFICATION');
  const suffix = suffixOf(event.id);

  let discrepancies = state.discrepancies;
  let alerts = state.alerts;
  let recommendations = state.recommendations;
  let nextUnit = { ...unit, lastEventId: event.id };
  let message: string;

  const mismatch = event.type === 'OBSERVATION' && event.locationHintId !== unit.expectedLocationId;
  const missed = event.type === 'MISSED_READ';

  if (event.type === 'OBSERVATION') {
    nextUnit = { ...nextUnit, observedLocationId: event.locationHintId, lastObservedAt: event.capturedAt };
  }

  if (mismatch || missed) {
    nextUnit = { ...nextUnit, verificationStatus: 'PENDING_VERIFICATION' };
    const kind = mismatch ? 'LOCATION_MISMATCH' : 'NOT_OBSERVED';
    const description = mismatch
      ? `Ubicación observada (${event.locationHintId}) distinta de la esperada (${unit.expectedLocationId}); pendiente de verificación.`
      : `Sin lectura de ${unit.id} en el recorrido; pendiente de verificación. No implica pérdida confirmada.`;

    if (openDisc && openDisc.kind === kind) {
      // Nueva evidencia para la misma discrepancia abierta: se agrega, no se duplica.
      discrepancies = discrepancies.map((d) => (d.id === openDisc.id
        ? { ...d, observedLocationId: nextUnit.observedLocationId, evidenceEventIds: [...d.evidenceEventIds, event.id] } : d));
      alerts = alerts.map((a) => (a.unitId === unit.id && a.type === kind && a.status !== 'RESOLVED'
        ? { ...a, evidenceEventIds: [...a.evidenceEventIds, event.id] } : a));
      message = `Evidencia ${event.id} agregada a la discrepancia abierta ${openDisc.id}.`;
    } else {
      const disc: Discrepancy = {
        id: `disc-${suffix}`,
        kind,
        unitId: unit.id,
        expectedLocationId: unit.expectedLocationId,
        observedLocationId: nextUnit.observedLocationId,
        status: 'PENDING_VERIFICATION',
        description,
        evidenceEventIds: [event.id],
      };
      const alert: Alert = {
        id: `alert-${suffix}`,
        type: kind,
        priority: mismatch ? 'HIGH' : 'MEDIUM',
        status: 'NEW',
        unitId: unit.id,
        description,
        evidenceEventIds: [event.id],
        createdAt: event.receivedAt,
      };
      discrepancies = [...discrepancies, disc];
      alerts = [...alerts, alert];
      const recId = `rec-verify-${unit.id.toLowerCase()}`;
      if (!recommendations.some((r) => r.id === recId)) {
        const verify: Recommendation = {
          id: recId,
          type: 'VERIFY_LOCATION',
          title: mismatch
            ? `Verificar ${unit.id} en ${unit.expectedLocationId} y ${event.locationHintId}`
            : `Recontar / verificar presencia de ${unit.id} en ${unit.expectedLocationId}`,
          reason: description,
          skuId: null,
          unitId: unit.id,
          estimatedImpactUsd: null,
          status: 'PROPOSED',
          assumptions: [
            `Evidencia: evento ${event.id} (fuente ${event.source}).`,
            'Una lectura aislada no confirma un traslado; se requiere verificación humana.',
            'La aprobación crea una tarea; no ajusta inventario ni ubicación esperada.',
          ],
        };
        recommendations = [...recommendations, verify];
      }
      message = `Evento ${event.id} procesado: discrepancia ${disc.id} y alerta ${alert.id} (${alert.priority}).`;
    }
  } else {
    // Observación coherente con lo esperado. Si hay una discrepancia abierta, NO se resuelve sola.
    if (!openDisc) nextUnit = { ...nextUnit, verificationStatus: 'OBSERVED' };
    message = `Evento ${event.id} procesado: observación coherente con ${unit.expectedLocationId}.`;
  }

  const next: DemoState = {
    ...state,
    units: state.units.map((u) => (u.id === unit.id ? nextUnit : u)),
    events: [...state.events, event],
    discrepancies,
    alerts,
    recommendations,
    audit: appendAudit(state, `[${event.source}] ${message}`),
    lastMessage: { kind: 'info', text: message },
  };
  return { state: next, outcome: 'APPLIED', message };
}
