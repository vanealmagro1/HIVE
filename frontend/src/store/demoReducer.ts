// Reducer puro: todas las mutaciones de la demo pasan por aquí.
import { ingestEvent } from '../engine/ingest';
import { closeReceipt } from '../engine/receiving';
import { buildMovement, confirmMovement, startMovement } from '../engine/transfers';
import { getScenario } from '../engine/scenarios';
import type { AlertStatus, InventoryEvent, Task } from '../domain/types';
import { appendAudit, createInitialState, type DemoState, type Section, type View } from './demoState';

export type DemoAction =
  | { type: 'RESET' }
  | { type: 'SELECT_UNIT'; unitId: string | null }
  | { type: 'SET_VIEW'; view: View }
  | { type: 'SET_FORCE_2D'; value: boolean }
  | { type: 'POST_EVENT'; event: InventoryEvent }
  | { type: 'RUN_SCENARIO'; scenarioId: string }
  | { type: 'APPROVE_RECOMMENDATION'; recommendationId: string; at?: string }
  | { type: 'REJECT_RECOMMENDATION'; recommendationId: string }
  | { type: 'SET_ALERT_STATUS'; alertId: string; status: AlertStatus }
  | { type: 'CLOSE_RECEIPT'; purchaseOrderId: string; closedAt: string }
  | { type: 'SET_PLAYBACK'; scenarioId: string | null }
  | { type: 'SET_SECTION'; section: Section }
  | { type: 'SET_SKU'; skuId: string | null }
  | { type: 'SET_LIVE_STATUS'; status: DemoState['ui']['live'] }
  | { type: 'SET_MESSAGE'; kind: 'info' | 'warning' | 'error'; text: string }
  | { type: 'FOCUS_UNIT'; unitId: string }
  | { type: 'START_MOVEMENT'; movementId: string; at: string }
  | { type: 'CONFIRM_MOVEMENT'; movementId: string; receivedQuantity: number; at: string };

const TASK_OWNER = 'Supervisor de inventarios (demo)';
/** Hora fija de la demo para la aprobación (no se usa el reloj del equipo). */
export const APPROVAL_TIME = '2026-11-19T10:20:00Z';

function approve(state: DemoState, id: string, at: string): DemoState {
  const rec = state.recommendations.find((r) => r.id === id);
  if (!rec) return { ...state, lastMessage: { kind: 'error', text: `Recomendación inexistente: ${id}` } };
  if (rec.status === 'REJECTED') return { ...state, lastMessage: { kind: 'error', text: `${id} fue rechazada; no puede aprobarse.` } };
  const taskId = `task-${rec.id}`;
  if (rec.status === 'APPROVED' || state.tasks.some((t) => t.id === taskId)) {
    const text = `${id} ya estaba aprobada; la tarea ${taskId} no se duplica.`;
    return { ...state, lastMessage: { kind: 'warning', text } };
  }
  const task: Task = {
    id: taskId, recommendationId: rec.id, title: rec.title, status: 'OPEN', owner: TASK_OWNER,
    skuId: rec.skuId, quantity: rec.quantity ?? null, createdAt: at,
  };
  // Redistribución: se prepara el traslado (pallets disponibles, origen y destino válidos). No mueve inventario.
  const planned = rec.type === 'REVIEW_EXCESS' ? buildMovement(state, rec, task, at) : null;
  const movement = planned && 'movement' in planned ? planned.movement : null;
  const plan = movement ? ` Traslado ${movement.id} preparado (${movement.unitIds.join(', ')}), pendiente de ejecución.`
    : planned && 'error' in planned ? ` Traslado no preparado: ${planned.error}` : '';
  const text = `Recomendación ${id} aprobada (acción simulada, sin ajuste ERP). Tarea ${taskId} creada.${plan}`;
  return {
    ...state,
    recommendations: state.recommendations.map((r) => (r.id === id ? { ...r, status: 'APPROVED' } : r)),
    tasks: [...state.tasks, task],
    movements: movement ? [...state.movements, movement] : state.movements,
    audit: appendAudit(state, text),
    lastMessage: { kind: 'info', text },
  };
}

function reject(state: DemoState, id: string): DemoState {
  const rec = state.recommendations.find((r) => r.id === id);
  if (!rec) return { ...state, lastMessage: { kind: 'error', text: `Recomendación inexistente: ${id}` } };
  if (rec.status !== 'PROPOSED') return { ...state, lastMessage: { kind: 'warning', text: `${id} ya está ${rec.status}.` } };
  const text = `Recomendación ${id} rechazada; no se crea tarea.`;
  return {
    ...state,
    recommendations: state.recommendations.map((r) => (r.id === id ? { ...r, status: 'REJECTED' } : r)),
    audit: appendAudit(state, text),
    lastMessage: { kind: 'info', text },
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'RESET': {
      const fresh = createInitialState();
      return { ...fresh, ui: { ...fresh.ui, force2D: state.ui.force2D, live: state.ui.live }, lastMessage: { kind: 'info', text: 'Demo reiniciada al estado semilla.' } };
    }
    case 'SELECT_UNIT':
    {
      if (action.unitId === null) return { ...state, ui: { ...state.ui, selectedUnitId: null } };
      const unit = state.units.find((u) => u.id === action.unitId);
      if (!unit) return state;
      // El producto de la unidad pasa a ser el SKU en foco (si es de un solo producto).
      const lot = state.lots.find((l) => l.id === unit.lotId);
      return { ...state, ui: { ...state.ui, selectedUnitId: action.unitId, skuId: lot?.skuId ?? state.ui.skuId } };
    }
    case 'SET_VIEW':
      return { ...state, ui: { ...state.ui, view: action.view } };
    case 'SET_FORCE_2D':
      return { ...state, ui: { ...state.ui, force2D: action.value } };
    case 'POST_EVENT':
      return ingestEvent(state, action.event).state;
    case 'RUN_SCENARIO': {
      const scenario = getScenario(action.scenarioId);
      return scenario.events.reduce((s, e) => ingestEvent(s, e).state, state);
    }
    case 'CLOSE_RECEIPT':
      return closeReceipt(state, action.purchaseOrderId, action.closedAt);
    case 'SET_SECTION':
      return { ...state, ui: { ...state.ui, section: action.section } };
    case 'SET_LIVE_STATUS':
      return state.ui.live === action.status ? state : { ...state, ui: { ...state.ui, live: action.status } };
    case 'SET_MESSAGE':
      return { ...state, lastMessage: { kind: action.kind, text: action.text } };
    case 'SET_SKU':
      if (action.skuId !== null && !state.skus.some((k) => k.id === action.skuId)) return state;
      return { ...state, ui: { ...state.ui, skuId: action.skuId } };
    case 'FOCUS_UNIT': {
      const s = demoReducer(state, { type: 'SELECT_UNIT', unitId: action.unitId });
      return s === state ? state : { ...s, ui: { ...s.ui, focusSeq: s.ui.focusSeq + 1 } };
    }
    case 'START_MOVEMENT':
      return startMovement(state, action.movementId, action.at);
    case 'CONFIRM_MOVEMENT':
      return confirmMovement(state, action.movementId, action.receivedQuantity, action.at);
    case 'SET_PLAYBACK':
      return { ...state, ui: { ...state.ui, playback: action.scenarioId } };
    case 'APPROVE_RECOMMENDATION':
      return approve(state, action.recommendationId, action.at ?? APPROVAL_TIME);
    case 'REJECT_RECOMMENDATION':
      return reject(state, action.recommendationId);
    case 'SET_ALERT_STATUS': {
      const alert = state.alerts.find((a) => a.id === action.alertId);
      if (!alert || alert.status === action.status) return state;
      const text = `Alerta ${alert.id}: ${alert.status} -> ${action.status}.`;
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === alert.id ? { ...a, status: action.status } : a)),
        audit: appendAudit(state, text),
        lastMessage: { kind: 'info', text },
      };
    }
    default:
      return state;
  }
}
