// Distribución de la pantalla (una sola idea por zona):
//   arriba    → marca, banner de simulación, fecha de referencia y reinicio
//   franja    → indicadores de la bodega (cambian en vivo con las lecturas RFID)
//   centro    → la bodega (3D o 2D), siempre visible
//   derecha   → panel con pestañas: RFID · Detalle · Inventario · Alertas · Predicción · Resultados
//   abajo     → el recorrido de la demo en 4 fases: Detectar · Priorizar · Actuar · Medir
import { useMemo } from 'react';
import { createActions, type ActionOptions } from './components/actions';
import AlertsPanel from './components/panels/AlertsPanel';
import AnalyticsPanel from './components/panels/AnalyticsPanel';
import InventoryPanel from './components/panels/InventoryPanel';
import MeasurePanel from './components/panels/MeasurePanel';
import RfidPanel from './components/panels/RfidPanel';
import UnitPanel from './components/panels/UnitPanel';
import TwinView from './components/twin/TwinView';
import { SIMULATION_BANNER } from './domain/constants';
import { formatNumber, formatUsd } from './domain/format';
import { inventoryTotals, type DemoState, type View } from './store/demoState';
import { demoStore, useDemoState, type DemoStore } from './store/demoStore';
import { alertStory, DEMO_EVENT_ID, demoSteps, nextDemoStep, type DemoPhase, type DemoStepId } from './store/selectors';

const TABS: { view: View; label: string }[] = [
  { view: 'rfid', label: 'RFID' },
  { view: 'twin', label: 'Detalle' },
  { view: 'inventory', label: 'Inventario' },
  { view: 'alerts', label: 'Alertas' },
  { view: 'analytics', label: 'Predicción' },
  { view: 'measure', label: 'Resultados' },
];

const STEP_HINT: Record<DemoStepId, string> = {
  receive: 'Llega el camión con la OC-2026-1187 (12 cajas). El portal RFID del andén las lee al pasar y HIVE las compara con la orden.',
  count: 'Un operario recorre el pasillo 4 con el lector de mano RFID. HIVE compara cada etiqueta con su ubicación registrada.',
  alert: 'Dos hallazgos: falta 1 caja en la recepción y un pallet de mochilas está en otro pasillo. Cada alerta dice qué hacer.',
  analytics: 'Mochilas: stock para 60 días frente a un objetivo de 30 → USD 2.400 en riesgo. HIVE ordena por dinero.',
  approve: 'Una persona aprueba: se crean tareas para reclamar el faltante y revisar el stock. El inventario no cambia solo.',
  measure: 'Resultados de la sesión: lecturas, cajas conciliadas, exactitud del pasillo y valor en revisión.',
  done: 'Recorrido completo. Pulse “Reiniciar demo” para repetirlo.',
};

const PHASES: DemoPhase[] = ['Detectar', 'Priorizar', 'Actuar', 'Medir'];

function Kpis({ state }: { state: DemoState }) {
  const totals = inventoryTotals(state);
  const units = [...totals.values()].reduce((a, b) => a + b, 0);
  const value = state.skus.reduce((a, s) => a + (totals.get(s.id) ?? 0) * s.unitCost, 0);
  const open = state.alerts.filter((a) => a.status !== 'RESOLVED');
  const atRisk = open.reduce((a, al) => a + alertStory(state, al).usd, 0);
  const tasks = state.tasks.filter((t) => t.status === 'OPEN').length;
  return (
    <section className="kpis" aria-label="Indicadores de la bodega">
      <div className="kpi"><div className="kpi-label">Unidades en bodega</div><div className="kpi-value" data-testid="kpi-units">{formatNumber(units)}</div><div className="kpi-sub">{state.skus.length} productos (SKU)</div></div>
      <div className="kpi"><div className="kpi-label">Valor del inventario</div><div className="kpi-value">{formatUsd(Math.round(value))}</div><div className="kpi-sub">a costo</div></div>
      <div className="kpi"><div className="kpi-label">Lecturas RFID</div><div className="kpi-value">{formatNumber(state.events.length)}</div><div className="kpi-sub">en esta sesión (simuladas)</div></div>
      <div className={`kpi${open.length ? ' is-alert' : ''}`}><div className="kpi-label">Alertas abiertas</div><div className="kpi-value">{open.length}</div><div className="kpi-sub">{open.length ? `${formatUsd(atRisk)} por verificar` : 'todo conciliado'}</div></div>
      <div className="kpi"><div className="kpi-label">Tareas abiertas</div><div className="kpi-value">{tasks}</div><div className="kpi-sub">aprobadas por una persona</div></div>
    </section>
  );
}

export default function App({ store = demoStore, playback }: { store?: DemoStore; playback?: ActionOptions }) {
  const state = useDemoState(store);
  const actions = useMemo(() => createActions(store, playback), [store, playback]);
  const steps = demoSteps(state);
  const next = nextDemoStep(state);
  const openAlerts = state.alerts.filter((a) => a.status !== 'RESOLVED').length;
  const eventDone = state.events.some((e) => e.id === DEMO_EVENT_ID);
  const playing = state.ui.playback !== null;
  const doneCount = steps.filter((s) => s.done).length;

  const stepAction: Record<Exclude<DemoStepId, 'done'>, { run: () => void; disabled: boolean }> = {
    receive: { run: actions.startReception, disabled: steps[0].done || playing },
    count: { run: actions.runDemoEvent, disabled: eventDone || playing },
    alert: { run: () => actions.setView('alerts'), disabled: !steps[1].done },
    analytics: { run: actions.openAnalytics, disabled: false },
    approve: { run: actions.approveDemoRecommendation, disabled: steps[4].done },
    measure: { run: actions.openMeasure, disabled: false },
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>⬡</span> HIVE
          <span className="brand-sub">De los datos de tu bodega a mejores decisiones</span>
        </div>
        <div className="sim-banner" role="status" data-testid="sim-banner">{SIMULATION_BANNER}</div>
        <div className="refdate">Fecha de referencia: <strong>{state.referenceDate}</strong></div>
        <button type="button" className="btn btn-danger" onClick={actions.reset}>↺ Reiniciar demo</button>
      </header>

      <Kpis state={state} />

      <main className="center">
        <TwinView state={state} onSelect={actions.selectFromMap} onToggle2D={actions.setForce2D} />
      </main>

      <aside className="sidepanel">
        <div className="tabs" role="tablist" aria-label="Panel de detalle">
          {TABS.map((t) => (
            <button
              key={t.view}
              type="button"
              role="tab"
              aria-selected={state.ui.view === t.view}
              className={`tab${state.ui.view === t.view ? ' is-active' : ''}`}
              onClick={() => actions.setView(t.view)}
            >
              {t.label}
              {t.view === 'alerts' && openAlerts > 0 && <span className="badge">{openAlerts}</span>}
            </button>
          ))}
        </div>
        <div className="tab-body" role="tabpanel" aria-live="polite">
          {state.ui.view === 'rfid' && <RfidPanel state={state} actions={actions} />}
          {state.ui.view === 'twin' && <UnitPanel state={state} actions={actions} />}
          {state.ui.view === 'inventory' && <InventoryPanel state={state} actions={actions} />}
          {state.ui.view === 'alerts' && <AlertsPanel state={state} actions={actions} />}
          {state.ui.view === 'analytics' && <AnalyticsPanel state={state} actions={actions} />}
          {state.ui.view === 'measure' && <MeasurePanel state={state} />}
        </div>
      </aside>

      <footer className="controlbar" aria-label="Recorrido de la demo">
        <div className="guide">
          <span className="guide-progress">{next === 'done' ? 'Completado' : `Paso ${doneCount + 1} de ${steps.length}`}</span>
          <span className="guide-hint">{playing ? 'Leyendo etiquetas RFID…' : STEP_HINT[next]}</span>
        </div>
        <div className="stepper-row">
          <div className="phases">
            {PHASES.map((phase) => (
              <div key={phase} className="phase" style={{ flex: steps.filter((s) => s.phase === phase).length }}>
                <div className="phase-name">{phase}</div>
                <div className="phase-steps">
                  {steps.map((s, i) => ({ s, i })).filter(({ s }) => s.phase === phase).map(({ s, i }) => {
                    const a = stepAction[s.id as Exclude<DemoStepId, 'done'>];
                    const cls = s.done ? 'is-done' : s.id === next ? 'is-next' : '';
                    return (
                      <button key={s.id} type="button" className={`step ${cls}`} onClick={a.run} disabled={a.disabled}>
                        <span className="step-dot" aria-hidden>{s.done ? '✔' : i + 1}</span>
                        {i + 1} · {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="stepper-extra">
            <button type="button" className="btn btn-ghost" onClick={actions.replayDemoEvent} disabled={!eventDone || playing} title="Reenvía la lectura evt-demo-001 para comprobar idempotencia">
              Reenviar lectura
            </button>
            <button type="button" className="btn btn-next" onClick={actions.nextStep} disabled={next === 'done' || playing}>
              Siguiente paso ▶
            </button>
          </div>
        </div>
        {state.lastMessage && (
          <div className={`toast toast-${state.lastMessage.kind}`} role="status" data-testid="last-message">{state.lastMessage.text}</div>
        )}
      </footer>
    </div>
  );
}
