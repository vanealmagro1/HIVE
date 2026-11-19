// Acciones de UI: todas pasan por el contrato demoApi o el store único (nada de estado paralelo).
import { createDemoApi } from '../api/demoApi';
import { getScenario, DEMO_SCENARIO_ID } from '../engine/scenarios';
import type { View } from '../store/demoState';
import type { DemoStore } from '../store/demoStore';
import { DEMO_RECOMMENDATION_ID, DEMO_UNIT_ID, nextDemoStep } from '../store/selectors';

export function createActions(store: DemoStore) {
  const api = createDemoApi(store);
  const demoEvent = getScenario(DEMO_SCENARIO_ID).events[0];
  const actions = {
    api,
    select: (unitId: string) => store.dispatch({ type: 'SELECT_UNIT', unitId }),
    setView: (view: View) => store.dispatch({ type: 'SET_VIEW', view }),
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
    reset: () => { api.resetDemo(); },
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
