// Distribución de la pantalla (una sola idea por zona):
//   arriba   → marca, banner de simulación, fecha de referencia y reinicio
//   centro   → la bodega (3D o 2D), siempre visible
//   derecha  → panel de detalle con pestañas: Pallet · Inventario · Alertas · Predicciones
//   abajo    → el recorrido de la demo: 5 pasos en orden + qué hacer ahora
import { useMemo } from 'react';
import { createActions } from './components/actions';
import AlertsPanel from './components/panels/AlertsPanel';
import AnalyticsPanel from './components/panels/AnalyticsPanel';
import InventoryPanel from './components/panels/InventoryPanel';
import UnitPanel from './components/panels/UnitPanel';
import TwinView from './components/twin/TwinView';
import { SIMULATION_BANNER } from './domain/constants';
import type { View } from './store/demoState';
import { demoStore, useDemoState, type DemoStore } from './store/demoStore';
import { DEMO_EVENT_ID, DEMO_RECOMMENDATION_ID, demoSteps, nextDemoStep, type DemoStepId } from './store/selectors';

const TABS: { view: View; label: string }[] = [
  { view: 'twin', label: 'Pallet' },
  { view: 'inventory', label: 'Inventario' },
  { view: 'alerts', label: 'Alertas' },
  { view: 'analytics', label: 'Predicciones' },
];

const STEP_HINT: Record<DemoStepId, string> = {
  select: 'Haga clic en el pallet PAL-001 (Zona A · Rack A1 · nivel 1) o pulse el paso 1.',
  event: 'Llega una lectura SIMULADA que asocia PAL-001 a LOC-B2. HIVE la registra como observación, no como traslado.',
  alert: 'HIVE compara lo esperado con la evidencia y crea una alerta que requiere verificación humana.',
  analytics: 'Cobertura y exceso estimado de SKU-A, con fórmulas y supuestos visibles.',
  approve: 'Al aprobar se crea una tarea para el equipo. El inventario no cambia.',
  done: 'Recorrido completo. Pulse “Reiniciar demo” para repetirlo.',
};

export default function App({ store = demoStore }: { store?: DemoStore }) {
  const state = useDemoState(store);
  const actions = useMemo(() => createActions(store), [store]);
  const steps = demoSteps(state);
  const next = nextDemoStep(state);
  const openAlerts = state.alerts.filter((a) => a.status !== 'RESOLVED').length;
  const eventDone = state.events.some((e) => e.id === DEMO_EVENT_ID);
  const recStatus = state.recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID)?.status;
  const doneCount = steps.filter((s) => s.done).length;

  const stepAction: Record<Exclude<DemoStepId, 'done'>, { run: () => void; disabled: boolean }> = {
    select: { run: actions.selectDemoUnit, disabled: false },
    event: { run: actions.runDemoEvent, disabled: eventDone },
    alert: { run: () => actions.setView('alerts'), disabled: !eventDone },
    analytics: { run: actions.openAnalytics, disabled: false },
    approve: { run: actions.approveDemoRecommendation, disabled: recStatus !== 'PROPOSED' },
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>⬡</span> HIVE
          <span className="brand-sub">Inteligencia operativa de inventarios</span>
        </div>
        <div className="sim-banner" role="status" data-testid="sim-banner">{SIMULATION_BANNER}</div>
        <div className="refdate">Fecha de referencia: <strong>{state.referenceDate}</strong></div>
        <button type="button" className="btn btn-danger" onClick={actions.reset}>↺ Reiniciar demo</button>
      </header>

      <main className="center">
        <TwinView state={state} onSelect={actions.select} onToggle2D={actions.setForce2D} />
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
          {state.ui.view === 'twin' && <UnitPanel state={state} actions={actions} />}
          {state.ui.view === 'inventory' && <InventoryPanel state={state} actions={actions} />}
          {state.ui.view === 'alerts' && <AlertsPanel state={state} actions={actions} />}
          {state.ui.view === 'analytics' && <AnalyticsPanel state={state} actions={actions} />}
        </div>
      </aside>

      <footer className="controlbar" aria-label="Recorrido de la demo">
        <div className="guide">
          <span className="guide-progress">{next === 'done' ? 'Completado' : `Paso ${doneCount + 1} de ${steps.length}`}</span>
          <span className="guide-hint">{STEP_HINT[next]}</span>
        </div>
        <div className="stepper-row">
          <ol className="stepper">
            {steps.map((s, i) => {
              const a = stepAction[s.id as Exclude<DemoStepId, 'done'>];
              const cls = s.done ? 'is-done' : s.id === next ? 'is-next' : '';
              return (
                <li key={s.id}>
                  <button type="button" className={`step ${cls}`} onClick={a.run} disabled={a.disabled}>
                    <span className="step-dot" aria-hidden>{s.done ? '✔' : i + 1}</span>
                    {i + 1} · {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="stepper-extra">
            <button type="button" className="btn btn-ghost" onClick={actions.replayDemoEvent} disabled={!eventDone} title="Reenvía evt-demo-001 para comprobar idempotencia">
              Reenviar evento
            </button>
            <button type="button" className="btn btn-next" onClick={actions.nextStep} disabled={next === 'done'}>
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
