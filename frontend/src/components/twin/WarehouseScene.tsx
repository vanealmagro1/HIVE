// Gemelo digital 3D. Todo lo que se dibuja deriva del estado único (props `state`).
// No usa recursos externos (sin fuentes, HDRI ni modelos remotos) para funcionar sin internet.
//
// Legibilidad: pasillos vistos de frente desde el andén; textos pintados en el piso (zonas, pasillos, andén);
// una sola ficha flotante (unidad bajo el cursor o seleccionada). Las cajas se dibujan con InstancedMesh
// (cientos de cajas en una sola llamada de dibujo).
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LogisticUnit } from '../../domain/types';
import type { DemoState } from '../../store/demoState';
import { STATUS_ICON, STATUS_LABEL, skuOfUnit, unitsWithOpenAlerts } from '../../store/selectors';
import { STATUS_COLOR } from './colors';
import {
  AISLE_W, BAY_W, DOCK_Z, FRONT_Z, LEVEL_HEIGHT, LEVELS, PORTAL_Z, RACK_DEPTH, RACK_HEIGHT, RACK_LENGTH, STORAGE_Z,
  aisleLayouts, locationPositions, rackLayouts, zoneLayouts, type Vec3,
} from './layout';

const CAMERA_HOME: Vec3 = [0, 15, 20.5];
const TARGET_HOME: Vec3 = [0, 0, -0.6];

interface SceneProps {
  state: DemoState;
  expiryRiskLots: Set<string>;
  onSelect: (unitId: string) => void;
  /** Se incrementa para volver al encuadre general. */
  resetViewRequest: number;
}

interface Inst { p: Vec3; s: Vec3; c?: string }

/** Muchas cajas iguales en una sola llamada de dibujo. `ids[i]` identifica la instancia para clic/hover. */
function InstancedBoxes({ items, color = '#ffffff', ids, onPick, onHover, opacity }: {
  items: Inst[]; color?: string; ids?: string[]; onPick?: (id: string) => void; onHover?: (id: string | null) => void; opacity?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      m.compose(new THREE.Vector3(...it.p), q, new THREE.Vector3(...it.s));
      mesh.setMatrixAt(i, m);
      if (it.c) mesh.setColorAt(i, c.set(it.c));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  const id = (e: ThreeEvent<PointerEvent | MouseEvent>) => (ids && e.instanceId !== undefined ? ids[e.instanceId] : undefined);
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[undefined, undefined, Math.max(items.length, 1)]}
      onClick={onPick ? (e) => { const x = id(e); if (x) { e.stopPropagation(); onPick(x); } } : undefined}
      onPointerMove={onHover ? (e) => { const x = id(e); if (x) { e.stopPropagation(); onHover(x); document.body.style.cursor = 'pointer'; } } : undefined}
      onPointerOut={onHover ? () => { onHover(null); document.body.style.cursor = 'auto'; } : undefined}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} />
    </instancedMesh>
  );
}

/** Texto pintado en el piso (textura de canvas: parte de la escena, sin DOM ni fuentes externas). */
function FloorText({ text, position, height, color = 'rgba(20, 60, 64, 0.85)' }: {
  text: string; position: Vec3; height: number; color?: string;
}) {
  const { texture, aspect } = useMemo(() => {
    const font = '800 96px "Segoe UI", system-ui, sans-serif';
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    if (ctx) ctx.font = font;
    const tw = ctx ? Math.ceil(ctx.measureText(text).width) : text.length * 60;
    canvas.width = tw + 32; canvas.height = 128;
    ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(text, canvas.width / 2, 68);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 4;
    return { texture: t, aspect: canvas.width / canvas.height };
  }, [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} raycast={() => null}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/** Estructura de todos los racks (postes, largueros y bandejas) con 3 InstancedMesh. */
function RackFrames({ racks }: { racks: { position: Vec3 }[] }) {
  const { posts, beams, decks } = useMemo(() => {
    const posts: Inst[] = []; const beams: Inst[] = []; const decks: Inst[] = [];
    for (const { position: [x, , z] } of racks) {
      for (let b = 0; b <= 5; b += 1) {
        const pz = z - RACK_LENGTH / 2 + b * BAY_W;
        for (const dx of [-RACK_DEPTH / 2, RACK_DEPTH / 2]) posts.push({ p: [x + dx, RACK_HEIGHT / 2, pz], s: [0.07, RACK_HEIGHT, 0.07] });
      }
      for (let l = 1; l <= LEVELS; l += 1) {
        const y = l * LEVEL_HEIGHT;
        for (const dx of [-RACK_DEPTH / 2, RACK_DEPTH / 2]) beams.push({ p: [x + dx, y, z], s: [0.08, 0.1, RACK_LENGTH] });
        if (l < LEVELS) decks.push({ p: [x, y + 0.04, z], s: [RACK_DEPTH, 0.03, RACK_LENGTH] });
      }
    }
    return { posts, beams, decks };
  }, [racks]);
  return (
    <>
      <InstancedBoxes items={posts} color="#214d51" />
      <InstancedBoxes items={beams} color="#d08a2c" />
      <InstancedBoxes items={decks} color="#b9c5bd" opacity={0.85} />
    </>
  );
}

/** Destello del campo de lectura del portal cada vez que llega una lectura. */
function PortalPulse({ readCount }: { readCount: number }) {
  const field = useRef<THREE.MeshBasicMaterial>(null);
  const antennas = useRef<THREE.MeshStandardMaterial[]>([]);
  const last = useRef(-10);
  const clock = useRef(0);
  useEffect(() => { if (readCount > 0) last.current = clock.current; }, [readCount]);
  useFrame((_, dt) => {
    clock.current += dt;
    const k = Math.max(0, 1 - (clock.current - last.current) / 0.45);
    if (field.current) field.current.opacity = 0.05 + 0.45 * k;
    for (const m of antennas.current) if (m) m.emissiveIntensity = 1.2 * k;
  });
  return (
    <>
      {[-1.7, 1.7].map((x, i) => (
        <mesh key={x} position={[x - Math.sign(x) * 0.12, 1.5, 0]}>
          <boxGeometry args={[0.06, 0.55, 0.55]} />
          <meshStandardMaterial ref={(m) => { if (m) antennas.current[i] = m; }} color="#83aa48" emissive="#d4f28c" emissiveIntensity={0} />
        </mesh>
      ))}
      <mesh position={[0, 1.4, 0]} raycast={() => null}>
        <boxGeometry args={[3.2, 2.7, 0.5]} />
        <meshBasicMaterial ref={field} color="#d4f28c" transparent opacity={0.05} depthWrite={false} />
      </mesh>
    </>
  );
}

/** Andén: piso, franjas de seguridad, portal RFID (2 antenas + lector) y camión del proveedor. */
function Dock({ width, readCount, truck }: { width: number; readCount: number; truck: boolean }) {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, (DOCK_Z + FRONT_Z) / 2 - 0.9]}>
        <planeGeometry args={[width, FRONT_Z - DOCK_Z + 3.2]} />
        <meshStandardMaterial color="#d6ddd3" />
      </mesh>
      {[DOCK_Z - 2.3, FRONT_Z - 0.05].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, z]}>
          <planeGeometry args={[width, 0.12]} />
          <meshBasicMaterial color="#e3b23c" />
        </mesh>
      ))}
      {[1, 2, 3, 4].map((n) => (
        <mesh key={n} rotation={[-Math.PI / 2, 0, 0]} position={[(n - 2.5) * 3, 0.01, DOCK_Z]}>
          <planeGeometry args={[1.5, 1.5]} />
          <meshBasicMaterial color="#c3cec6" />
        </mesh>
      ))}
      {/* Portal RFID en la puerta del andén */}
      <group position={[0, 0, PORTAL_Z]}>
        {[-1.7, 1.7].map((x) => (
          <mesh key={x} position={[x, 1.4, 0]}><boxGeometry args={[0.14, 2.8, 0.14]} /><meshStandardMaterial color="#143c40" /></mesh>
        ))}
        <mesh position={[0, 2.85, 0]}><boxGeometry args={[3.55, 0.16, 0.18]} /><meshStandardMaterial color="#143c40" /></mesh>
        <mesh position={[1.95, 1.2, 0]}><boxGeometry args={[0.28, 0.36, 0.12]} /><meshStandardMaterial color="#267c71" /></mesh>
        <PortalPulse readCount={readCount} />
      </group>
      {truck && (
        <group position={[0, 0, FRONT_Z + 3.4]}>
          <mesh position={[0, 1.55, 0]}><boxGeometry args={[2.5, 2.6, 4.6]} /><meshStandardMaterial color="#f4f6f2" /></mesh>
          <mesh position={[0, 1.1, 3.0]}><boxGeometry args={[2.4, 1.9, 1.4]} /><meshStandardMaterial color="#267c71" /></mesh>
          {[-1.6, 1.6, 3.0].map((z) => [-1.1, 1.1].map((x) => (
            <mesh key={`${x},${z}`} position={[x, 0.38, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.38, 0.38, 0.3, 16]} /><meshStandardMaterial color="#2b3535" /></mesh>
          )))}
        </group>
      )}
    </group>
  );
}

interface UnitBoxes { boxes: Inst[]; boxIds: string[]; pallets: Inst[]; palletIds: string[]; footprint: Map<string, { p: Vec3; h: number }> }

/** Coloca pallets y cajas de cada ubicación en una grilla 2×2 por capa. */
/** Variación sutil de tono por caja (textura visual), determinista por índice. */
function shade(hex: string, i: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return `#${c.setHSL(hsl.h, hsl.s, Math.min(0.9, hsl.l * (0.92 + ((i * 37) % 17) / 100))).getHexString()}`;
}

const SELECTED_COLOR = '#d4f28c';

function layoutUnits(units: LogisticUnit[], locPos: Map<string, Vec3>, selectedId: string | null): UnitBoxes {
  const children = new Map<string, LogisticUnit[]>();
  for (const u of units) if (u.parentId) children.set(u.parentId, [...(children.get(u.parentId) ?? []), u]);
  const roots = new Map<string, LogisticUnit[]>();
  for (const u of units) if (!u.parentId) roots.set(u.expectedLocationId, [...(roots.get(u.expectedLocationId) ?? []), u]);

  const out: UnitBoxes = { boxes: [], boxIds: [], pallets: [], palletIds: [], footprint: new Map() };
  const slot = (i: number): [number, number, number] => [((i % 4) % 2 === 0 ? -0.25 : 0.25), Math.floor(i / 4), (Math.floor((i % 4) / 2) === 0 ? -0.29 : 0.29)];
  for (const [locId, list] of roots) {
    const base = locPos.get(locId);
    if (!base) continue;
    let i = 0;
    for (const u of list) {
      if (u.type === 'PALLET') {
        out.pallets.push({ p: [base[0], base[1] + 0.06, base[2]], s: [1.0, 0.12, 1.22] });
        out.palletIds.push(u.id);
        let top = 0.12;
        (children.get(u.id) ?? []).forEach((_, j) => {
          const [dx, layer, dz] = slot(j);
          out.boxes.push({ p: [base[0] + dx, base[1] + 0.12 + 0.17 + layer * 0.35, base[2] + dz], s: [0.46, 0.33, 0.54], c: u.id === selectedId ? SELECTED_COLOR : shade(STATUS_COLOR[u.verificationStatus], out.boxes.length) });
          out.boxIds.push(u.id);
          top = Math.max(top, 0.12 + 0.35 * (layer + 1));
        });
        out.footprint.set(u.id, { p: base, h: top });
      } else {
        const [dx, layer, dz] = slot(i);
        out.boxes.push({ p: [base[0] + dx, base[1] + 0.17 + layer * 0.35, base[2] + dz], s: [0.46, 0.33, 0.54], c: u.id === selectedId ? SELECTED_COLOR : shade(STATUS_COLOR[u.verificationStatus], out.boxes.length) });
        out.boxIds.push(u.id);
        out.footprint.set(u.id, { p: [base[0] + dx, base[1] + layer * 0.35, base[2] + dz], h: 0.35 });
        i += 1;
      }
    }
  }
  return out;
}

function ObservationGhost({ position, unitId, locationId }: { position: Vec3; unitId: string; locationId: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.0, 0.9, 1.22]} />
        <meshStandardMaterial color="#d98a1c" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.04, 0.94, 1.26]} />
        <meshBasicMaterial color="#d98a1c" wireframe />
      </mesh>
      <Html position={[0, RACK_HEIGHT - position[1] + 0.9, 0]} center pointerEvents="none" zIndexRange={[15, 5]}>
        <div className="label3d-ghost">◇ Leído aquí: {unitId} <small>· {locationId}</small></div>
      </Html>
    </group>
  );
}

/** Ficha flotante única, sobre el rack de la unidad enfocada. */
function UnitCallout({ state, unit, position, alert, expiryRisk }: {
  state: DemoState; unit: LogisticUnit; position: Vec3; alert: boolean; expiryRisk: boolean;
}) {
  const sku = skuOfUnit(state, unit);
  const observedElsewhere = unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId;
  return (
    <Html position={[position[0], RACK_HEIGHT + 1.5, position[2]]} center pointerEvents="none" zIndexRange={[20, 16]}>
      <div className={`callout${alert ? ' is-alert' : ''}`} data-testid="unit-callout">
        <div className="callout-title">{unit.type === 'PALLET' ? 'Pallet' : 'Caja'} {unit.id} · {unit.quantityBaseUnits} u</div>
        <div>{sku?.name ?? '—'}</div>
        <div>Registrado: <strong>{unit.expectedLocationId}</strong>
          {observedElsewhere && <> · Leído en: <strong>{unit.observedLocationId}</strong></>}
        </div>
        <div>{STATUS_ICON[unit.verificationStatus]} {STATUS_LABEL[unit.verificationStatus]}{expiryRisk && ' · ⏳ vence pronto'}</div>
      </div>
    </Html>
  );
}

/** Gancho de verificación: posición en pantalla de una unidad (lo usa scripts/verify-browser.mjs). */
function ProjectionHook({ footprint }: { footprint: Map<string, { p: Vec3; h: number }> }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const w = window as unknown as { __hiveProject?: (id: string) => { x: number; y: number } | null };
    w.__hiveProject = (id) => {
      const f = footprint.get(id);
      if (!f) return null;
      const v = new THREE.Vector3(f.p[0], f.p[1] + f.h / 2 + 0.1, f.p[2]).project(camera);
      const r = gl.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    return () => { delete w.__hiveProject; };
  }, [camera, gl, footprint]);
  return null;
}

function CameraReset({ request }: { request: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const animating = useRef(false);
  const camGoal = useMemo(() => new THREE.Vector3(...CAMERA_HOME), []);
  const targetGoal = useMemo(() => new THREE.Vector3(...TARGET_HOME), []);
  useEffect(() => { if (request > 0) animating.current = true; }, [request]);
  useFrame(() => {
    if (!controls || !animating.current) return;
    camera.position.lerp(camGoal, 0.12);
    controls.target.lerp(targetGoal, 0.12);
    controls.update();
    if (camera.position.distanceTo(camGoal) < 0.02 && controls.target.distanceTo(targetGoal) < 0.02) animating.current = false;
  });
  return null;
}

function SceneContent({ state, expiryRiskLots, onSelect, resetViewRequest }: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const zones = useMemo(() => zoneLayouts(state.zones), [state.zones]);
  const racks = useMemo(() => rackLayouts(state.zones, state.racks), [state.zones, state.racks]);
  const storageRacks = useMemo(() => racks.filter((r) => r.storage), [racks]);
  const aisles = useMemo(() => aisleLayouts(state.zones, state.racks), [state.zones, state.racks]);
  const locPos = useMemo(() => locationPositions(state.zones, state.racks, state.locations), [state.zones, state.racks, state.locations]);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId) ?? null;
  const selectedRoot = selected?.parentId ? state.units.find((u) => u.id === selected.parentId) ?? null : selected;
  const units = useMemo(() => layoutUnits(state.units, locPos, selectedRoot?.id ?? null), [state.units, locPos, selectedRoot?.id]);
  const alerting = unitsWithOpenAlerts(state);
  const isRisk = (u: LogisticUnit) => u.lotId !== null && expiryRiskLots.has(u.lotId);
  const width = zones.find((z) => z.zone.kind === 'RECEIVING')?.size[0] ?? 34;
  const po = state.purchaseOrders[0];
  const missing = po ? po.boxes.length - po.receivedBoxIds.length : 0;
  const dockPos = po ? locPos.get(po.dockLocationId) : undefined;

  // Unidades leídas en una ubicación distinta de la registrada (evidencia, no traslado confirmado).
  const ghosts = state.units.filter((u) => !u.parentId && u.observedLocationId && u.observedLocationId !== u.expectedLocationId);
  const focused = state.units.find((u) => u.id === hoveredId) ?? selectedRoot;
  const focusedFoot = focused ? units.footprint.get(focused.id) : undefined;
  const selectedFoot = selectedRoot ? units.footprint.get(selectedRoot.id) : undefined;

  return (
    <>
      <color attach="background" args={['#e6ece6']} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[12, 22, 14]} intensity={1.2} />
      <directionalLight position={[-14, 12, -8]} intensity={0.35} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 1]}>
        <planeGeometry args={[width + 4, 26]} />
        <meshStandardMaterial color="#cfd9d1" />
      </mesh>
      {zones.filter((z) => z.zone.kind !== 'RECEIVING').map(({ zone, center, size }) => (
        <group key={zone.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0.003, center[2]]}>
            <planeGeometry args={size} />
            <meshStandardMaterial color="#c2cfc6" />
          </mesh>
          <FloorText text={`${zone.name.toUpperCase()} · ${(zone.category ?? '').toUpperCase()}`} position={[center[0], 0.02, STORAGE_Z + RACK_LENGTH / 2 + 1.6]} height={0.62} />
        </group>
      ))}
      {aisles.map((a) => (
        <group key={a.aisle}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[a.x, 0.006, STORAGE_Z]}>
            <planeGeometry args={[AISLE_W - 0.2, RACK_LENGTH]} />
            <meshStandardMaterial color="#d7e0d9" />
          </mesh>
          <FloorText text={`P${a.aisle}`} position={[a.x, 0.02, STORAGE_Z + RACK_LENGTH / 2 + 0.6]} height={0.85} color="rgba(38, 124, 113, 0.95)" />
        </group>
      ))}
      <Dock width={width} readCount={po?.readCount ?? 0} truck={po?.status !== 'CLOSED'} />
      {po && po.status === 'CLOSED' && missing > 0 && dockPos && (
        <group position={[dockPos[0] + 0.25, dockPos[1] + 0.29 + 2 * 0.35, dockPos[2] + 0.29]}>
          <mesh><boxGeometry args={[0.5, 0.36, 0.58]} /><meshBasicMaterial color="#c2412d" wireframe /></mesh>
          <Html position={[0, 0.9, 0]} center pointerEvents="none" zIndexRange={[15, 5]}>
            <div className="label3d-missing">Falta {missing} caja{missing > 1 ? 's' : ''} · {po.id}</div>
          </Html>
        </group>
      )}
      <FloorText text="ANDÉN DE RECEPCIÓN · PORTAL RFID" position={[-9.5, 0.02, PORTAL_Z - 0.4]} height={0.7} />

      <RackFrames racks={storageRacks} />
      <InstancedBoxes items={units.pallets} color="#a8835a" ids={units.palletIds} onPick={onSelect} onHover={setHoveredId} />
      <InstancedBoxes items={units.boxes} ids={units.boxIds} onPick={onSelect} onHover={setHoveredId} />

      {/* Riesgo de vencimiento: franja roja sobre los pallets del lote. */}
      {state.units.filter((u) => u.type === 'PALLET' && isRisk(u)).map((u) => {
        const f = units.footprint.get(u.id);
        return f ? (
          <mesh key={`risk-${u.id}`} position={[f.p[0], f.p[1] + f.h + 0.04, f.p[2]]}>
            <boxGeometry args={[1.0, 0.06, 1.22]} /><meshStandardMaterial color="#c2412d" />
          </mesh>
        ) : null;
      })}

      {selectedFoot && (
        <mesh position={[selectedFoot.p[0], selectedFoot.p[1] + Math.max(selectedFoot.h, 0.4) / 2 + 0.02, selectedFoot.p[2]]}>
          <boxGeometry args={[1.14, Math.max(selectedFoot.h, 0.4) + 0.12, 1.34]} />
          <meshBasicMaterial color="#143c40" wireframe />
        </mesh>
      )}

      {ghosts.map((u) => {
        const obs = locPos.get(u.observedLocationId!);
        const exp = locPos.get(u.expectedLocationId);
        if (!obs || !exp) return null;
        const y = RACK_HEIGHT + 0.5;
        return (
          <group key={`ghost-${u.id}`}>
            <mesh position={[exp[0], exp[1] + 0.5, exp[2]]}>
              <boxGeometry args={[1.2, 1.0, 1.4]} />
              <meshBasicMaterial color="#2f6fb0" wireframe />
            </mesh>
            <ObservationGhost position={obs} unitId={u.id} locationId={u.observedLocationId!} />
            <Line
              points={[[exp[0], exp[1] + 1.0, exp[2]], [exp[0], y, exp[2]], [obs[0], y, obs[2]], [obs[0], obs[1] + 1.0, obs[2]]]}
              color="#d98a1c"
              lineWidth={2.5}
              dashed
              dashSize={0.35}
              gapSize={0.2}
            />
          </group>
        );
      })}

      {focused && focusedFoot && (
        <UnitCallout state={state} unit={focused} position={focusedFoot.p} alert={alerting.has(focused.id)} expiryRisk={isRisk(focused)} />
      )}

      <OrbitControls
        makeDefault
        enableDamping
        target={TARGET_HOME}
        minDistance={6}
        maxDistance={42}
        minPolarAngle={0.25}
        maxPolarAngle={1.35}
        minAzimuthAngle={-1.1}
        maxAzimuthAngle={1.1}
      />
      <CameraReset request={resetViewRequest} />
      <ProjectionHook footprint={units.footprint} />
    </>
  );
}

export default function WarehouseScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: CAMERA_HOME, fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'default' }}
      data-testid="warehouse-canvas"
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
