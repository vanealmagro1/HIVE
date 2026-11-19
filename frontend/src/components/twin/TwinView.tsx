import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import Warehouse2D from './Warehouse2D';
import { hasWebGL } from './webgl';

const WarehouseScene = lazy(() => import('./WarehouseScene'));

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('Fallo del render 3D; se usa la vista 2D.', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface Props {
  state: DemoState;
  onSelect: (unitId: string) => void;
  onToggle2D: (value: boolean) => void;
}

function Legend() {
  return (
    <div className="legend" aria-label="Leyenda">
      <span><span className="sw" style={{ background: '#8aa1b8' }} /> Esperado (sin lectura)</span>
      <span><span className="sw" style={{ background: '#3fa56b' }} /> Observado coherente</span>
      <span><span className="sw" style={{ background: '#e09a1a' }} /> ⚠ Pendiente de verificación</span>
      <span><span className="sw sw-outline" style={{ borderColor: '#2f7fd1' }} /> Ubicación esperada</span>
      <span><span className="sw sw-ghost" /> ◇ Observación (no confirmada)</span>
      <span><span className="sw" style={{ background: '#c0392b' }} /> ⏳ Riesgo de vencimiento</span>
      <span className="legend-note">Posiciones asignadas por el sistema, no localización RTLS.</span>
    </div>
  );
}

export default function TwinView({ state, onSelect, onToggle2D }: Props) {
  const webgl = useMemo(() => hasWebGL(), []);
  const [resetViewRequest, setResetViewRequest] = useState(0);
  const expiryRiskLots = useMemo(() => new Set(
    computeAnalytics(state).flatMap((a) => a.expiryRisks.filter((r) => r.remainingAtExpiry > 0).map((r) => r.lotId)),
  ), [state]);

  const use2D = state.ui.force2D || !webgl;
  const fallback = <Warehouse2D state={state} expiryRiskLots={expiryRiskLots} onSelect={onSelect} />;

  return (
    <div className="twin">
      <div className="twin-toolbar">
        <span className="twin-title">Gemelo digital · {state.warehouse.name}</span>
        <span className="twin-source">Eventos <strong>SIMULADOS</strong> · sin RFID ni BLE conectados</span>
        {!use2D && (
          <button type="button" className="btn-small" onClick={() => setResetViewRequest((n) => n + 1)}>
            Vista general
          </button>
        )}
        <button type="button" className="btn-small" onClick={() => onToggle2D(!state.ui.force2D)} disabled={!webgl}>
          {use2D ? 'Ver en 3D' : 'Vista 2D'}
        </button>
        {!webgl && <span className="warn-inline">WebGL no disponible: vista 2D con las mismas acciones.</span>}
      </div>
      <div className="twin-stage">
        {/* El Canvas se mantiene montado al pasar a 2D: desmontarlo con etiquetas <Html> de drei
            provoca errores de React ("removeChild"). Solo se oculta. */}
        {use2D && fallback}
        {webgl && (
          <div className="scene-host" style={{ display: use2D ? 'none' : 'block' }}>
            <SceneErrorBoundary fallback={fallback}>
              <Suspense fallback={<div className="loading">Cargando escena 3D…</div>}>
                <WarehouseScene state={state} expiryRiskLots={expiryRiskLots} onSelect={onSelect} resetViewRequest={resetViewRequest} />
              </Suspense>
            </SceneErrorBoundary>
          </div>
        )}
        {!use2D && <div className="twin-hint">Clic en un pallet: ver ficha · Arrastrar: girar · Rueda: zoom</div>}
      </div>
      <Legend />
    </div>
  );
}
