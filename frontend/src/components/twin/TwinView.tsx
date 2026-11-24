// Contenedor del gemelo: escena 3D (o 2D de respaldo), capas, búsqueda, modos de exploración y tarjeta de selección.
// La selección es el estado compartido (state.ui.selectedUnitId); la cámara y el aislamiento son estado local de vista.
import {
  Box, ChevronLeft, ChevronRight, Eye, Layers, LayoutGrid, MapPin, Maximize, Minimize, Minus, Plus, RotateCcw, Search, X,
} from 'lucide-react';
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import { STATUS_LABEL, unitContents } from '../../store/selectors';
import { productIcon } from '../layout/Shell';
import Warehouse2D from './Warehouse2D';
import { EVENT_COLOR } from './colors';
import { rackOfUnit, searchInventory, type SearchHit } from './search';
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
  onClear: () => void;
  onToggle2D: (value: boolean) => void;
  /** Integrado en la página del gemelo: sin buscador ni tarjeta flotante (la ficha está en la columna lateral). */
  embedded?: boolean;
}

export type RackMode = 'solid' | 'transparent' | 'hidden';
/** Capas del gemelo. Por defecto: paredes ocultas y racks transparentes (el inventario es lo primero). */
export interface SceneLayers { inventory: boolean; racks: RackMode; walls: boolean; signage: boolean; decor: boolean; labels: boolean }
export const DEFAULT_LAYERS: SceneLayers = { inventory: true, racks: 'transparent', walls: false, signage: true, decor: true, labels: true };

/** Orden de cámara: cada orden nueva (n distinto) produce un vuelo suave. */
export type CamCommand =
  | { n: number; kind: 'home' | 'top' }
  | { n: number; kind: 'step'; step: number }
  | { n: number; kind: 'unit'; unitId: string }
  | { n: number; kind: 'rack'; rackId: string };

type CamOrder = CamCommand extends infer C ? (C extends unknown ? Omit<C, 'n'> : never) : never;

/** Estado operativo legible para la tarjeta de selección. */
const OP_STATUS: Record<string, string> = {
  OBSERVED: 'Disponible', EXPECTED: 'Sin lectura reciente', PENDING_VERIFICATION: 'Por verificar', CONFIRMED: 'Verificado',
};

export default function TwinView({ state, onSelect, onClear, onToggle2D, embedded = false }: Props) {
  const webgl = useMemo(() => hasWebGL(), []);
  const [cmd, setCmd] = useState<CamCommand | null>(null);
  const [zoom, setZoom] = useState({ n: 0, dir: 1 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<SceneLayers>(DEFAULT_LAYERS);
  const [isolatedRack, setIsolatedRack] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitIndex, setHitIndex] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [showContents, setShowContents] = useState(false);
  const [full, setFull] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const nextN = useRef(1);
  const order = (c: CamOrder) => setCmd({ ...c, n: nextN.current++ } as CamCommand);

  const expiryRiskLots = useMemo(() => new Set(
    computeAnalytics(state).flatMap((a) => a.expiryRisks.filter((r) => r.remainingAtExpiry > 0).map((r) => r.lotId)),
  ), [state.units, state.lots, state.skus, state.dailyDemand]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enfoque pedido desde fuera del gemelo (lista de inventario, tablas, alertas → "Ver en gemelo").
  useEffect(() => {
    if (state.ui.focusSeq > 0 && state.ui.selectedUnitId) { setIsolatedRack(null); order({ kind: 'unit', unitId: state.ui.selectedUnitId }); }
  }, [state.ui.focusSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === host.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.current?.requestFullscreen?.();
  };

  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId) ?? null;
  const root = selected?.parentId ? state.units.find((u) => u.id === selected.parentId) ?? null : selected;
  const contents = root ? unitContents(state, root) : null;

  const clearAll = () => { onClear(); setIsolatedRack(null); setShowContents(false); setListOpen(false); };
  // Escape cierra la selección (si no hay un drawer abierto, que tiene su propio Escape).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.drawer')) return;
      if (state.ui.selectedUnitId || isolatedRack || listOpen) clearAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const focusUnit = (unitId: string) => { onSelect(unitId); setShowContents(false); order({ kind: 'unit', unitId }); };
  const runSearch = (q: string) => {
    setQuery(q);
    const r = searchInventory(state, q);
    setHits(r); setHitIndex(0); setListOpen(r.length > 0);
  };
  const goHit = (i: number) => {
    if (!hits.length) return;
    const k = (i + hits.length) % hits.length;
    setHitIndex(k); setListOpen(false); setIsolatedRack(null);
    focusUnit(hits[k].unitId);
  };
  const isolate = () => {
    if (!root) return;
    const rackId = rackOfUnit(state, root.id);
    if (!rackId || rackId === 'R-REC') return;
    setIsolatedRack(rackId);
    order({ kind: 'rack', rackId });
  };
  const general = () => { setIsolatedRack(null); order({ kind: 'home' }); };

  const use2D = state.ui.force2D || !webgl;
  const fallback = <Warehouse2D state={state} expiryRiskLots={expiryRiskLots} onSelect={onSelect} />;
  const Icon = productIcon(contents?.skuId ?? null);
  const rackName = isolatedRack ? state.racks.find((r) => r.id === isolatedRack)?.name : null;

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
                  onSelect={(id) => { onSelect(id); setShowContents(false); }}
                  onFocusUnit={focusUnit}
                  camCommand={cmd}
                  zoomRequest={zoom}
                  layers={layers}
                  isolatedRackId={isolatedRack}
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
          <>
            <button type="button" className="tool" onClick={general} aria-label="Vista general" title="Vista general"><RotateCcw size={18} /></button>
            <button type="button" className="tool" onClick={() => { setIsolatedRack(null); order({ kind: 'top' }); }} aria-label="Vista superior" title="Vista superior"><LayoutGrid size={18} /></button>
          </>
        )}
      </div>
      {layersOpen && (
        <div className="layers-menu" role="group" aria-label="Capas del gemelo">
          {([['inventory', 'Cajas y pallets'], ['walls', 'Paredes'], ['signage', 'Señalización'], ['decor', 'Decoración y animación'], ['labels', 'Etiquetas']] as const).map(([k, label]) => (
            <label key={k}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} /> {label}</label>
          ))}
          <div className="seg" role="radiogroup" aria-label="Estructura de racks">
            <span className="seg-label">Racks</span>
            {([['solid', 'Sólidos'], ['transparent', 'Transparentes'], ['hidden', 'Ocultos']] as const).map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={layers.racks === m} className={layers.racks === m ? 'is-on' : ''} onClick={() => setLayers({ ...layers, racks: m })}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Búsqueda: producto, SKU, pallet, caja o ubicación */}
      {!embedded && <div className="twin-search">
        <div className="search-box">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={query}
            placeholder="Buscar producto, SKU, pallet o ubicación"
            aria-label="Buscar en el gemelo"
            onChange={(e) => runSearch(e.target.value)}
            onFocus={() => setListOpen(hits.length > 0)}
            onKeyDown={(e) => { if (e.key === 'Enter') goHit(hitIndex); }}
          />
        </div>
        {listOpen && (
          <ul className="search-list" role="listbox" aria-label="Resultados">
            {hits.slice(0, 7).map((h, i) => (
              <li key={h.unitId}>
                <button type="button" role="option" aria-selected={i === hitIndex} onClick={() => goHit(i)}>
                  <strong>{h.title}</strong>
                  <span className="muted">{h.subtitle} · {h.unitId} · {h.locationId}</span>
                </button>
              </li>
            ))}
            {hits.length > 7 && <li className="search-more">+{hits.length - 7} coincidencias más (usa ‹ ›)</li>}
          </ul>
        )}
        {hits.length > 0 && !listOpen && (
          <div className="hit-nav" aria-label="Coincidencias">
            <button type="button" className="round-btn" onClick={() => goHit(hitIndex - 1)} aria-label="Coincidencia anterior"><ChevronLeft size={16} /></button>
            <span>{hitIndex + 1} de {hits.length}</span>
            <button type="button" className="round-btn" onClick={() => goHit(hitIndex + 1)} aria-label="Coincidencia siguiente"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>}

      {/* Tarjeta de selección (producto → SKU · cantidad → pallet → ubicación → estado) */}
      {embedded && root && !use2D && (
        <div className="sel-bar" data-testid="selection-bar">
          {isolatedRack
            ? <button type="button" className="btn btn-small" onClick={general}><Eye size={14} /> Ver toda la bodega</button>
            : <button type="button" className="btn btn-small" onClick={isolate}>Aislar rack</button>}
          <button type="button" className="btn btn-small" onClick={() => order({ kind: 'unit', unitId: root.id })}>Enfocar</button>
          <button type="button" className="btn btn-small" onClick={clearAll} aria-label="Cerrar selección"><X size={14} /></button>
        </div>
      )}
      {!embedded && root && contents && (
        <div className="sel-card" data-testid="selection-card">
          <div className="sel-head">
            <span className="product-icon"><Icon size={18} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="product-name">{contents.title}</div>
              <div className="product-sub">{contents.subtitle}</div>
            </div>
            <button type="button" className="round-btn" onClick={clearAll} aria-label="Cerrar selección"><X size={16} /></button>
          </div>
          <div className="sel-meta">
            <span className="ref-badge">{root.id}</span>
            <span><MapPin size={13} /> {root.expectedLocationId}</span>
            <span className={`status-chip ${root.verificationStatus === 'PENDING_VERIFICATION' ? 'pending' : 'ok'}`}>{OP_STATUS[root.verificationStatus] ?? STATUS_LABEL[root.verificationStatus]}</span>
          </div>
          {root.observedLocationId && root.observedLocationId !== root.expectedLocationId && (
            <div className="note"><MapPin size={12} /> Detectada: <strong>{root.observedLocationId}</strong></div>
          )}
          {contents.kind === 'mixed' && showContents && (
            <div className="mix-lines" data-testid="sel-contents">
              {contents.lines.map((l) => <div key={l.skuId} className="mix-line"><span><strong>{l.name}</strong> <span className="muted">· {l.skuId}</span></span><span>{l.qty} u</span></div>)}
            </div>
          )}
          <div className="sel-actions">
            {contents.kind === 'mixed' && (
              <button type="button" className="btn btn-small" onClick={() => setShowContents((v) => !v)}>{showContents ? 'Ocultar contenido' : 'Ver contenido'}</button>
            )}
            {!use2D && (isolatedRack
              ? <button type="button" className="btn btn-small" onClick={general}><Eye size={14} /> Ver toda la bodega</button>
              : <button type="button" className="btn btn-small" onClick={isolate}>Aislar rack</button>)}
            {!use2D && <button type="button" className="btn btn-small" onClick={() => order({ kind: 'unit', unitId: root.id })}>Enfocar</button>}
          </div>
        </div>
      )}
      {rackName && <div className="mode-pill">Rack aislado · {rackName} <button type="button" onClick={general} aria-label="Salir del rack aislado"><X size={13} /></button></div>}

      {!use2D && (
        <div className="zoom">
          <button type="button" onClick={() => setZoom((z) => ({ n: z.n + 1, dir: 1 }))} aria-label="Acercar"><Plus size={18} /></button>
          <button type="button" onClick={() => setZoom((z) => ({ n: z.n + 1, dir: -1 }))} aria-label="Alejar"><Minus size={18} /></button>
        </div>
      )}
      <div className="legend" aria-label="Leyenda">
        <span><span className="sw" style={{ background: EVENT_COLOR.selected }} />Seleccionado</span>
        <span><span className="sw" style={{ background: EVENT_COLOR.pending }} />Por verificar</span>
        <span><span className="sw" style={{ background: EVENT_COLOR.verified }} />Verificado</span>
      </div>
      {!webgl && <div className="webgl-note">Vista 2D: WebGL no disponible</div>}
    </div>
  );
}
