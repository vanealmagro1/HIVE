// HIVE UI v2 · Operaciones: Dashboard · Gemelo digital · Inventario · Eventos · Analítica · Acciones.
// El gemelo 3D se monta UNA sola vez (no se recrea al navegar); el resto de páginas lee el mismo estado.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createActions, type ActionOptions } from './components/actions';
import { Header, NAV, Sidebar } from './components/layout/Shell';
import ActionsPage from './components/pages/ActionsPage';
import AnalyticsPage from './components/pages/AnalyticsPage';
import DashboardPage from './components/pages/DashboardPage';
import EventsPage from './components/pages/EventsPage';
import EvidenceDrawer, { type EvidenceTarget } from './components/pages/EvidenceDrawer';
import InventoryPage from './components/pages/InventoryPage';
import TwinPage from './components/pages/TwinPage';
import TwinView from './components/twin/TwinView';
import { BEACON_BOXES } from './seed/seed';
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
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(null);
  const closeEvidence = useCallback(() => setEvidence(null), []);
  const openUnitEvidence = useCallback((unitId: string) => setEvidence({ unitId }), []);
  const section = state.ui.section;
  // Cada sección empieza desde arriba (no hereda el scroll de la anterior).
  useEffect(() => { document.querySelector('.content')?.scrollTo?.({ top: 0 }); }, [section]);
  // Lector en vivo (beacons vía el relé local). Sin servidor (pruebas) queda apagado sin errores.
  useEffect(() => { actions.startLive(); return () => actions.stopLive(); }, [actions]);
  // Plan B del pitch (oculto): Alt+1/2/… = beacon leído en su ubicación · Alt+Shift+1/2/… = en otra ubicación.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (i < 0 || !BEACON_BOXES[i]) return;
      e.preventDefault();
      actions.simulateBeacon(BEACON_BOXES[i].label, e.shiftKey ? 'away' : 'home');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
  useEffect(() => { document.title = `HIVE · ${NAV.find((n) => n.section === section)?.label ?? ''}`; }, [section]);

  const twin = (
    <TwinView state={state} onSelect={actions.selectFromMap} onClear={actions.clearSelection} onToggle2D={actions.setForce2D} embedded />
  );

  return (
    <div className="app">
      <Sidebar state={state} actions={actions} />
      <div className="main">
        <Header state={state} />
        <main className="content">
          <div style={{ display: section === 'gemelo' ? undefined : 'none' }}>
            <TwinPage state={state} actions={actions} twin={twin} onEvidence={openUnitEvidence} />
          </div>
          {section === 'dashboard' && <DashboardPage state={state} actions={actions} />}
          {section === 'inventario' && <InventoryPage state={state} actions={actions} onEvidence={openUnitEvidence} />}
          {section === 'eventos' && <EventsPage state={state} actions={actions} onEvidence={(row) => setEvidence({ row })} />}
          {section === 'analitica' && <AnalyticsPage state={state} actions={actions} />}
          {section === 'acciones' && <ActionsPage state={state} actions={actions} />}
        </main>
      </div>
      <EvidenceDrawer state={state} target={evidence} onClose={closeEvidence} />
      <Toast text={state.ui.playback === null ? state.lastMessage?.text ?? null : null} />
    </div>
  );
}
