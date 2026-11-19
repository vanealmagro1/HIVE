import { Box, Layers, Maximize, Minimize, Minus, Plus, RotateCcw } from 'lucide-react';
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import Warehouse2D from './Warehouse2D';
import { EVENT_COLOR } from './colors';
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
  /** Paso del recorrido que se encuadra automáticamente (null = vista libre). */
  focusStep: number | null;
}

export interface SceneLayers { labels: boolean; ambient: boolean }

export default function TwinView({ state, onSelect, onToggle2D, focusStep }: Props) {
  const webgl = useMemo(() => hasWebGL(), []);
  const [resetView, setResetView] = useState(0);
  const [zoom, setZoom] = useState({ n: 0, dir: 1 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<SceneLayers>({ labels: true, ambient: true });
  const [full, setFull] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const expiryRiskLots = useMemo(() => new Set(
    computeAnalytics(state).flatMap((a) => a.expiryRisks.filter((r) => r.remainingAtExpiry > 0).map((r) => r.lotId)),
  ), [state.units, state.lots, state.skus, state.dailyDemand]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === host.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.current?.requestFullscreen?.();
  };

  const use2D = state.ui.force2D || !webgl;
  const fallback = <Warehouse2D state={state} expiryRiskLots={expiryRiskLots} onSelect={onSelect} />;

  return (
    <div className="twin-card" ref={host} data-testid="twin">
      <div className="twin-stage">
        {/* El Canvas se mantiene montado al pasar a 2D (desmontarlo con <Html> de drei provoca errores de React). */}
        {use2D && fallback}
        {webgl && (
          <div className="scene-host" style={{ display: use2D ? 'none' : 'block' }}>
            <SceneErrorBoundary fallback={fallback}>
              <Suspense fallback={<div className="loading">Cargando gemelo digital…</div>}>
                <WarehouseScene
                  state={state}
                  expiryRiskLots={expiryRiskLots}
                  onSelect={onSelect}
                  resetViewRequest={resetView}
                  zoomRequest={zoom}
                  focusStep={focusStep}
                  layers={layers}
                />
              </Suspense>
            </SceneErrorBoundary>
          </div>
        )}
      </div>

      <div className="tools">
        <button type="button" className={`tool${layersOpen ? ' is-on' : ''}`} onClick={() => setLayersOpen((v) => !v)} aria-label="Capas" aria-expanded={layersOpen}>
          <Layers size={20} />
        </button>
        <button type="button" className={`tool${!use2D ? ' is-on' : ''}`} onClick={() => onToggle2D(!state.ui.force2D)} disabled={!webgl}
          aria-label={use2D ? 'Ver en 3D' : 'Vista 2D'} title={use2D ? 'Ver en 3D' : 'Vista 2D'}>
          <Box size={20} />
        </button>
        <button type="button" className="tool" onClick={toggleFull} aria-label={full ? 'Salir de pantalla completa' : 'Pantalla completa'}>
          {full ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
        {!use2D && (
          <button type="button" className="tool" onClick={() => setResetView((n) => n + 1)} aria-label="Vista general" title="Vista general">
            <RotateCcw size={18} />
          </button>
        )}
      </div>
      {layersOpen && (
        <div className="layers-menu" role="group" aria-label="Capas del gemelo">
          <label><input type="checkbox" checked={layers.labels} onChange={(e) => setLayers({ ...layers, labels: e.target.checked })} /> Señalización y etiquetas</label>
          <label><input type="checkbox" checked={layers.ambient} onChange={(e) => setLayers({ ...layers, ambient: e.target.checked })} /> Animación ambiental</label>
        </div>
      )}
      {!use2D && (
        <div className="zoom">
          <button type="button" onClick={() => setZoom((z) => ({ n: z.n + 1, dir: 1 }))} aria-label="Acercar"><Plus size={18} /></button>
          <button type="button" onClick={() => setZoom((z) => ({ n: z.n + 1, dir: -1 }))} aria-label="Alejar"><Minus size={18} /></button>
        </div>
      )}
      <div className="legend" aria-label="Leyenda">
        <span><span className="sw" style={{ background: EVENT_COLOR.selected }} />Seleccionado</span>
        <span><span className="sw" style={{ background: EVENT_COLOR.pending }} />Por verificar</span>
        <span><span className="sw" style={{ background: EVENT_COLOR.confirmed }} />Discrepancia confirmada</span>
        <span><span className="sw" style={{ background: EVENT_COLOR.verified }} />Verificado</span>
      </div>
      {!webgl && <div className="webgl-note">Vista 2D: WebGL no disponible</div>}
    </div>
  );
}
