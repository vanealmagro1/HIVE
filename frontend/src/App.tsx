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
import { DEMO_EVENT_ID, DEMO_RECOMMENDATION_ID, DEMO_UNIT_ID, demoSteps, nextDemoStep } from './store/selectors';

const NAV: { view: View; label: string }[] = [
  { view: 'twin', label: 'Gemelo 3D' },
  { view: 'inventory', label: 'Inventario' },
  { view: 'alerts', label: 'Alertas' },
  { view: 'analytics', label: 'Predicciones' },
];

export default function App({ store = demoStore }: { store?: DemoStore }) {
  const state = useDemoState(store);
  const actions = useMemo(() => createActions(store), [store]);
  const steps = demoSteps(state);
  const next = nextDemoStep(state);
  const openAlerts = state.alerts.filter((a) => a.status !== 'RESOLVED').length;
  const eventDone = state.events.some((e) => e.id === DEMO_EVENT_ID);
  const recStatus = state.recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID)?.status;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>⬡</span> HIVE
          <span className="brand-sub">Inteligencia operativa de inventarios · prototipo demostrativo</span>
        </div>
        <div className="sim-banner" role="status" data-testid="sim-banner">{SIMULATION_BANNER}</div>
        <div className="refdate">Fecha de referencia: <strong>{state.referenceDate}</strong></div>
      </header>

      <nav className="sidenav" aria-label="Navegación">
        {NAV.map((item) => (
          <button
            key={item.view}
            type="button"
            className={`nav-btn${state.ui.view === item.view ? ' is-active' : ''}`}
            aria-current={state.ui.view === item.view ? 'page' : undefined}
            onClick={() => actions.setView(item.view)}
          >
            {item.label}
            {item.view === 'alerts' && openAlerts > 0 && <span className="badge">{openAlerts}</span>}
          </button>
        ))}
        <div className="steps" aria-label="Recorrido de demo">
          <div className="steps-title">Recorrido 90 s</div>
          <ol>
            {steps.map((s) => (
              <li key={s.id} className={s.done ? 'is-done' : s.id === next ? 'is-next' : ''}>
                {s.done ? '✔' : s.id === next ? '➜' : '·'} {s.label}
              </li>
            ))}
          </ol>
        </div>
        <div className="sidenav-foot small">
          Fuente de eventos: <strong>SIMULADA</strong>. Sin RFID UHF ni BLE conectados. Estado en memoria del navegador (sin backend).
        </div>
      </nav>

      <main className="center">
        <TwinView state={state} onSelect={actions.select} onToggle2D={actions.setForce2D} />
      </main>

      <aside className="sidepanel" aria-live="polite">
        {state.ui.view === 'twin' && <UnitPanel state={state} actions={actions} />}
        {state.ui.view === 'inventory' && <InventoryPanel state={state} actions={actions} />}
        {state.ui.view === 'alerts' && <AlertsPanel state={state} actions={actions} />}
        {state.ui.view === 'analytics' && <AnalyticsPanel state={state} actions={actions} />}
      </aside>

      <footer className="controlbar">
        <button type="button" className={`btn btn-lg${next === 'select' ? ' is-next' : ''}`} onClick={actions.selectDemoUnit}>
          1 · Seleccionar {DEMO_UNIT_ID}
        </button>
        <button type="button" className={`btn btn-lg${next === 'event' ? ' is-next' : ''}`} onClick={actions.runDemoEvent} disabled={eventDone}>
          2 · Ejecutar evento simulado
        </button>
        <button type="button" className="btn btn-lg btn-ghost" onClick={actions.replayDemoEvent} disabled={!eventDone} title="Reenvía evt-demo-001 para comprobar idempotencia">
          Reenviar evento
        </button>
        <button type="button" className={`btn btn-lg${next === 'analytics' || next === 'alert' ? ' is-next' : ''}`} onClick={actions.openAnalytics}>
          3 · Ver predicción
        </button>
        <button type="button" className={`btn btn-lg btn-primary${next === 'approve' ? ' is-next' : ''}`} onClick={actions.approveDemoRecommendation} disabled={recStatus !== 'PROPOSED'}>
          4 · Aprobar recomendación
        </button>
        <button type="button" className="btn btn-lg btn-next" onClick={actions.nextStep} disabled={next === 'done'}>
          Siguiente paso ▶
        </button>
        <button type="button" className="btn btn-lg btn-danger" onClick={actions.reset}>
          ↺ Reiniciar demo
        </button>
        {state.lastMessage && (
          <div className={`toast toast-${state.lastMessage.kind}`} role="status" data-testid="last-message">{state.lastMessage.text}</div>
        )}
      </footer>
    </div>
  );
}
