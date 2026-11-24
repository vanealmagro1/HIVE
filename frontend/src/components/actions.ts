// Acciones de UI: todas pasan por el contrato demoApi o el store único (nada de estado paralelo).
// Las lecturas "en vivo" se reproducen con una fuente simulada (ingest/readSource) que entrega cada
// evento a demoApi.postEvent: el mismo camino que usarán el portal, el lector de mano y los beacons reales.
import { createDemoApi } from '../api/demoApi';
import { DEMO_SCENARIO_ID, getScenario, RECEIPT_CLOSE_TIME } from '../engine/scenarios';
import { SimulatedRfidSource } from '../ingest/readSource';
import { EXECUTION_START_TIME, RECEPTION_CONFIRM_TIME } from '../engine/transfers';
import { DEMO_PO_ID } from '../seed/seed';
import type { Section, View } from '../store/demoState';
import type { DemoStore } from '../store/demoStore';
import { COUNT_SCENARIO_ID, DEMO_EVENT_ID, DEMO_RECOMMENDATION_ID, DEMO_UNIT_ID, RECEIPT_SCENARIO_ID } from '../store/selectors';

export interface ActionOptions {
  /** Milisegundos entre lecturas simuladas (por defecto: ritmo visible para una presentación). */
  receiptIntervalMs?: number;
  countIntervalMs?: number;
}

export function createActions(store: DemoStore, options: ActionOptions = {}) {
  const api = createDemoApi(store);
  const demoEvent = getScenario(DEMO_SCENARIO_ID).events.find((e) => e.id === DEMO_EVENT_ID)!;
  const receiptReads = getScenario(RECEIPT_SCENARIO_ID).events;
  const countReads = getScenario(COUNT_SCENARIO_ID).events;
  let source: SimulatedRfidSource | null = null;

  const processed = (id: string) => store.getState().events.some((e) => e.id === id);
  const po = () => store.getState().purchaseOrders.find((p) => p.id === DEMO_PO_ID);

  const finishReception = () => {
    api.closeReceipt(DEMO_PO_ID, RECEIPT_CLOSE_TIME);
    store.dispatch({ type: 'SET_PLAYBACK', scenarioId: null });
  };
  const finishCount = () => {
    store.dispatch({ type: 'SET_PLAYBACK', scenarioId: null });
    store.dispatch({ type: 'SELECT_UNIT', unitId: DEMO_UNIT_ID });
  };
  /** Reproduce un escenario lectura por lectura (solo visualización: el resultado es el mismo que procesarlo de una vez). */
  const play = (scenarioId: string, events: typeof receiptReads, intervalMs: number, onDone: () => void) => {
    source?.stop();
    store.dispatch({ type: 'SET_PLAYBACK', scenarioId });
    source = new SimulatedRfidSource(`sim-${scenarioId}`, events.filter((e) => !processed(e.id)), intervalMs);
    source.start((e) => { api.postEvent(e); }, onDone);
  };

  const actions = {
    api,
    select: (unitId: string) => store.dispatch({ type: 'SELECT_UNIT', unitId }),
    setView: (view: View) => store.dispatch({ type: 'SET_VIEW', view }),
    /** Clic en la bodega (3D o 2D): selecciona y muestra su ficha. */
    selectFromMap: (unitId: string) => { actions.select(unitId); actions.setView('twin'); },
    clearSelection: () => store.dispatch({ type: 'SELECT_UNIT', unitId: null }),
    setForce2D: (value: boolean) => store.dispatch({ type: 'SET_FORCE_2D', value }),
    selectDemoUnit: () => { actions.select(DEMO_UNIT_ID); actions.setView('twin'); },

    /** Paso 1 · el camión pasa por el portal RFID del andén (lecturas en vivo) y se cierra la recepción. Idempotente. */
    startReception: () => {
      const p = po();
      if (!p || p.status === 'CLOSED' || source?.running) return;
      play(RECEIPT_SCENARIO_ID, receiptReads, options.receiptIntervalMs ?? 380, finishReception);
    },
    /** Plan B: procesa todas las lecturas de inmediato (mismo resultado, sin animación). */
    completeReception: () => {
      source?.stop();
      const p = po();
      if (!p || p.status === 'CLOSED') return;
      for (const e of receiptReads) if (!processed(e.id)) api.postEvent(e);
      finishReception();
    },

    /** Paso 2 · conteo cíclico del pasillo D con lector de mano (lecturas en vivo). */
    runDemoEvent: () => {
      if (processed(DEMO_EVENT_ID) || source?.running) return;
      play(COUNT_SCENARIO_ID, countReads, options.countIntervalMs ?? 140, finishCount);
    },
    completeCount: () => {
      source?.stop();
      for (const e of countReads) if (!processed(e.id)) api.postEvent(e);
      finishCount();
    },
    /** Reenvía la lectura clave para demostrar idempotencia (no duplica nada). */
    replayDemoEvent: () => { api.postEvent(demoEvent); },
    runScenario: (scenarioId: string) => {
      for (const e of getScenario(scenarioId).events) api.postEvent(e);
      actions.setView('alerts');
    },
    openAnalytics: () => actions.setView('analytics'),
    approve: (recommendationId: string) => { api.approveRecommendation(recommendationId); },
    reject: (recommendationId: string) => store.dispatch({ type: 'REJECT_RECOMMENDATION', recommendationId }),
    /** Paso 5 · una persona aprueba la recomendación de sobrestock (solo con el botón; avanzar no aprueba). */
    approveDemoRecommendation: () => {
      if (store.getState().recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID)?.status === 'PROPOSED') {
        api.approveRecommendation(DEMO_RECOMMENDATION_ID);
      }
    },
    openMeasure: () => actions.setView('measure'),
    /** Producto en foco (compartido por gemelo, gráficas y recomendaciones). */
    setSku: (skuId: string) => store.dispatch({ type: 'SET_SKU', skuId }),
    /** Abre el gemelo enfocando el primer pallet del producto. */
    locateSku: (skuId: string) => {
      const s = store.getState();
      const lots = new Set(s.lots.filter((l) => l.skuId === skuId).map((l) => l.id));
      const pallet = s.units.find((u) => u.type === 'PALLET' && u.lotId !== null && lots.has(u.lotId));
      if (!pallet) return;
      store.dispatch({ type: 'SET_SECTION', section: 'gemelo' });
      store.dispatch({ type: 'FOCUS_UNIT', unitId: pallet.id });
    },
    focusUnit: (unitId: string) => store.dispatch({ type: 'FOCUS_UNIT', unitId }),
    /** Paso 6 · simular la ejecución del traslado aprobado (no cambia el inventario todavía). */
    simulateExecution: (movementId: string) => store.dispatch({ type: 'START_MOVEMENT', movementId, at: EXECUTION_START_TIME }),
    /** Paso 6 · confirmación explícita en destino: valida la cantidad leída y actualiza el inventario simulado. */
    confirmReception: (movementId: string, receivedQuantity?: number) => {
      const m = store.getState().movements.find((x) => x.id === movementId);
      if (!m) return;
      store.dispatch({ type: 'CONFIRM_MOVEMENT', movementId, receivedQuantity: receivedQuantity ?? m.quantity, at: RECEPTION_CONFIRM_TIME });
    },
    setSection: (section: Section) => store.dispatch({ type: 'SET_SECTION', section }),
    /** Abre el gemelo enfocando una unidad (cámara + resaltado). */
    locateUnit: (unitId: string) => {
      store.dispatch({ type: 'SET_SECTION', section: 'gemelo' });
      store.dispatch({ type: 'FOCUS_UNIT', unitId });
    },
    setAlertInReview: (alertId: string) => store.dispatch({ type: 'SET_ALERT_STATUS', alertId, status: 'IN_REVIEW' }),
    reset: () => { source?.stop(); source = null; api.resetDemo(); },
  };
  return actions;
}

export type Actions = ReturnType<typeof createActions>;
