// Reducer puro: todas las mutaciones de la demo pasan por aquí.
import { ingestEvent } from '../engine/ingest';
import { closeReceipt } from '../engine/receiving';
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
  | { type: 'APPROVE_RECOMMENDATION'; recommendationId: string }
  | { type: 'REJECT_RECOMMENDATION'; recommendationId: string }
  | { type: 'SET_ALERT_STATUS'; alertId: string; status: AlertStatus }
  | { type: 'CLOSE_RECEIPT'; purchaseOrderId: string; closedAt: string }
  | { type: 'SET_PLAYBACK'; scenarioId: string | null }
  | { type: 'SET_SECTION'; section: Section }
  | { type: 'SET_STEP'; step: number }
  | { type: 'SET_DRAWER'; open: boolean };

const TASK_OWNER = 'Supervisor de inventarios (demo)';

function approve(state: DemoState, id: string): DemoState {
  const rec = state.recommendations.find((r) => r.id === id);
  if (!rec) return { ...state, lastMessage: { kind: 'error', text: `Recomendación inexistente: ${id}` } };
  if (rec.status === 'REJECTED') return { ...state, lastMessage: { kind: 'error', text: `${id} fue rechazada; no puede aprobarse.` } };
  const taskId = `task-${rec.id}`;
  if (rec.status === 'APPROVED' || state.tasks.some((t) => t.id === taskId)) {
    const text = `${id} ya estaba aprobada; la tarea ${taskId} no se duplica.`;
    return { ...state, lastMessage: { kind: 'warning', text } };
  }
  const task: Task = { id: taskId, recommendationId: rec.id, title: rec.title, status: 'OPEN', owner: TASK_OWNER };
  const text = `Recomendación ${id} aprobada (acción simulada, sin ajuste ERP). Tarea ${taskId} creada.`;
  return {
    ...state,
    recommendations: state.recommendations.map((r) => (r.id === id ? { ...r, status: 'APPROVED' } : r)),
    tasks: [...state.tasks, task],
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
      return { ...fresh, ui: { ...fresh.ui, force2D: state.ui.force2D }, lastMessage: { kind: 'info', text: 'Demo reiniciada al estado semilla.' } };
    }
    case 'SELECT_UNIT':
      if (action.unitId !== null && !state.units.some((u) => u.id === action.unitId)) return state;
      return { ...state, ui: { ...state.ui, selectedUnitId: action.unitId } };
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
      return { ...state, ui: { ...state.ui, section: action.section, drawer: false } };
    case 'SET_STEP':
      return { ...state, ui: { ...state.ui, step: Math.max(0, Math.min(5, action.step)), drawer: false } };
    case 'SET_DRAWER':
      return { ...state, ui: { ...state.ui, drawer: action.open } };
    case 'SET_PLAYBACK':
      return { ...state, ui: { ...state.ui, playback: action.scenarioId } };
    case 'APPROVE_RECOMMENDATION':
      return approve(state, action.recommendationId);
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
