// HIVE UI v1.1 (referencia: docs/design/hive-ui-reference.png)
//   Sidebar (navegación real) · Header (bodega, "Demo simulada", alertas, perfil)
//   Resumen: KPIs + gemelo 3D protagonista + panel contextual del paso actual + barra de 6 pasos
//   Inventario · Gemelo digital · Eventos · Analítica · Reportes (pendiente)
// El gemelo se monta UNA sola vez y se comparte entre Resumen y Gemelo digital (no se recrea al navegar).
import { useEffect, useMemo, useState } from 'react';
import { createActions, type ActionOptions } from './components/actions';
import { Header, KpiCards, PendingView, Sidebar } from './components/layout/Shell';
import { DetailDrawer, StepBar, StepPanel } from './components/layout/Steps';
import AlertsPanel from './components/panels/AlertsPanel';
import AnalyticsPanel from './components/panels/AnalyticsPanel';
import InventoryPanel from './components/panels/InventoryPanel';
import MeasurePanel from './components/panels/MeasurePanel';
import RfidPanel from './components/panels/RfidPanel';
import UnitPanel from './components/panels/UnitPanel';
import TwinView from './components/twin/TwinView';
import { demoStore, useDemoState, type DemoStore } from './store/demoStore';

/** Aviso breve de la última acción; se oculta solo a los pocos segundos. */
function Toast({ text }: { text: string | null }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    setShown(text);
    if (!text) return undefined;
    const h = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(h);
  }, [text]);
  return shown ? <div className="toast" role="status" data-testid="last-message">{shown}</div> : null;
}

export default function App({ store = demoStore, playback }: { store?: DemoStore; playback?: ActionOptions }) {
  const state = useDemoState(store);
  const actions = useMemo(() => createActions(store, playback), [store, playback]);
  const section = state.ui.section;
  const twinVisible = section === 'resumen' || section === 'gemelo';

  return (
    <div className="app">
      <Sidebar state={state} actions={actions} />
      <div className="main">
        <Header state={state} actions={actions} />
        <main className="content">
          <div className="resumen" style={{ display: twinVisible ? undefined : 'none', height: section === 'gemelo' ? 'calc(100% - 4px)' : undefined }}>
            {section === 'resumen' ? <KpiCards state={state} /> : <h1 className="section-title">Gemelo digital</h1>}
            <div className="overview">
              <TwinView
                state={state}
                onSelect={actions.selectFromMap}
                onToggle2D={actions.setForce2D}
                focusStep={section === 'resumen' ? state.ui.step : null}
              />
              {section === 'resumen'
                ? <StepPanel state={state} actions={actions} />
                : <section className="card" style={{ overflow: 'auto' }}><UnitPanel state={state} actions={actions} /></section>}
            </div>
            {section === 'resumen' && <StepBar state={state} actions={actions} />}
          </div>

          {section === 'inventario' && (
            <>
              <h1 className="section-title">Inventario</h1>
              <div className="card"><InventoryPanel state={state} actions={actions} /></div>
            </>
          )}
          {section === 'eventos' && (
            <>
              <h1 className="section-title">Eventos</h1>
              <div className="section-grid">
                <div className="card"><RfidPanel state={state} actions={actions} /></div>
                <div className="card"><AlertsPanel state={state} actions={actions} /></div>
              </div>
            </>
          )}
          {section === 'analitica' && (
            <>
              <h1 className="section-title">Analítica</h1>
              <div className="section-grid">
                <div className="card"><AnalyticsPanel state={state} actions={actions} /></div>
                <div className="card"><MeasurePanel state={state} /></div>
              </div>
            </>
          )}
          {section === 'reportes' && (
            <>
              <h1 className="section-title">Reportes</h1>
              <PendingView title="Reportes" />
            </>
          )}
        </main>
      </div>
      <DetailDrawer state={state} actions={actions} />
      <Toast text={state.ui.playback === null ? state.lastMessage?.text ?? null : null} />
    </div>
  );
}
