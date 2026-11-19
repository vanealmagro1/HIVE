// Acciones de UI: todas pasan por el contrato demoApi o el store único (nada de estado paralelo).
import { createDemoApi } from '../api/demoApi';
import { getScenario, DEMO_SCENARIO_ID, RECEIPT_CLOSE_TIME } from '../engine/scenarios';
import { SimulatedRfidSource } from '../ingest/readSource';
import { DEMO_PO_ID } from '../seed/seed';
import type { View } from '../store/demoState';
import type { DemoStore } from '../store/demoStore';
import { DEMO_RECOMMENDATION_ID, DEMO_UNIT_ID, nextDemoStep } from '../store/selectors';

export function createActions(store: DemoStore) {
  const api = createDemoApi(store);
  const demoEvent = getScenario(DEMO_SCENARIO_ID).events[0];
  const receiptReads = getScenario('DEMO_RECEIPT_001').events;
  let source: SimulatedRfidSource | null = null;
  const finishReception = () => {
    api.closeReceipt(DEMO_PO_ID, RECEIPT_CLOSE_TIME);
    store.dispatch({ type: 'SET_PLAYBACK', scenarioId: null });
  };
  const actions = {
    api,
    select: (unitId: string) => store.dispatch({ type: 'SELECT_UNIT', unitId }),
    setView: (view: View) => store.dispatch({ type: 'SET_VIEW', view }),
    /** Clic en la bodega (3D o 2D): selecciona y muestra su ficha. */
    selectFromMap: (unitId: string) => { actions.select(unitId); actions.setView('twin'); },
    setForce2D: (value: boolean) => store.dispatch({ type: 'SET_FORCE_2D', value }),
    selectDemoUnit: () => { actions.select(DEMO_UNIT_ID); actions.setView('twin'); },
    runDemoEvent: () => {
      api.postEvent(demoEvent);
      store.dispatch({ type: 'SELECT_UNIT', unitId: demoEvent.unitId });
      actions.setView('alerts');
    },
    replayDemoEvent: () => { api.postEvent(demoEvent); },
    runScenario: (scenarioId: string) => {
      for (const e of getScenario(scenarioId).events) api.postEvent(e);
      actions.setView('alerts');
    },
    openAnalytics: () => actions.setView('analytics'),
    approve: (recommendationId: string) => { api.approveRecommendation(recommendationId); },
    reject: (recommendationId: string) => store.dispatch({ type: 'REJECT_RECOMMENDATION', recommendationId }),
    approveDemoRecommendation: () => { actions.setView('analytics'); api.approveRecommendation(DEMO_RECOMMENDATION_ID); },
    setAlertInReview: (alertId: string) => store.dispatch({ type: 'SET_ALERT_STATUS', alertId, status: 'IN_REVIEW' }),
    /** Reproduce en vivo las lecturas del portal del andén (fuente simulada) y cierra la recepción al terminar. */
    startReception: () => {
      const po = store.getState().purchaseOrders.find((p) => p.id === DEMO_PO_ID);
      actions.setView('rfid');
      if (!po || po.status === 'CLOSED' || source?.running) return;
      store.dispatch({ type: 'SET_PLAYBACK', scenarioId: 'DEMO_RECEIPT_001' });
      source = new SimulatedRfidSource('sim-portal-anden-1', receiptReads);
      source.start((e) => { api.postEvent(e); }, finishReception);
    },
    /** Plan B: procesa todas las lecturas de inmediato (mismo resultado, sin animación). */
    completeReception: () => {
      source?.stop();
      actions.setView('rfid');
      const po = store.getState().purchaseOrders.find((p) => p.id === DEMO_PO_ID);
      if (!po || po.status === 'CLOSED') return;
      for (const e of receiptReads) if (!store.getState().events.some((x) => x.id === e.id)) api.postEvent(e);
      finishReception();
    },
    reset: () => { source?.stop(); api.resetDemo(); },
    nextStep: () => {
      switch (nextDemoStep(store.getState())) {
        case 'select': return actions.selectDemoUnit();
        case 'event': return actions.runDemoEvent();
        case 'alert': return actions.setView('alerts');
        case 'analytics': return actions.openAnalytics();
        case 'approve': return actions.approveDemoRecommendation();
        default: return undefined;
      }
    },
  };
  return actions;
}

export type Actions = ReturnType<typeof createActions>;
