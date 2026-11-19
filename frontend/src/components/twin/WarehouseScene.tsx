// Gemelo digital 3D (HIVE UI v1.1). Todo lo operativo deriva del estado único (props `state`).
// Sin recursos externos (fuentes, HDRI o modelos remotos): funciona sin internet.
//
// Capas visuales:
//   1. Operativa  → racks, pallets/cajas (InstancedMesh), selección, alertas, evidencia de ubicación.
//   2. Eventos    → animaciones de lecturas simuladas (portal RFID, lector de mano, recepción): acentos morado/ámbar.
//   3. Ambiente   → montacargas, señalización, muelles, iluminación: neutros, NO seleccionables y sin relación con el
//                   inventario; se pueden apagar desde "Capas" y se pausan con prefers-reduced-motion.
import { AdaptiveDpr, Html, Line, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { MapPin } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { LogisticUnit } from '../../domain/types';
import type { DemoState } from '../../store/demoState';
import { COUNT_SCENARIO_ID, RECEIPT_SCENARIO_ID, unitContents, unitsWithOpenAlerts } from '../../store/selectors';
import { productIcon } from '../layout/Shell';
import { EVENT_COLOR, familyColor } from './colors';
import {
  AISLE_W, BAY_W, DOCK_Z, FRONT_Z, LEVEL_HEIGHT, LEVELS, PORTAL_Z, RACK_DEPTH, RACK_HEIGHT, RACK_LENGTH, STORAGE_Z,
  aisleLayouts, locationPositions, rackLayouts, zoneLayouts, type Vec3,
} from './layout';
import type { CamCommand, SceneLayers } from './TwinView';

const CAMERA_HOME: Vec3 = [-21, 19, 23];
const TARGET_HOME: Vec3 = [0.5, 0, -0.5];
const SELECTED_BOX = '#a58bff';
const HOVER_BOX = '#d6c9ff';
const D2_X = 7.5;

interface SceneProps {
  state: DemoState;
  expiryRiskLots: Set<string>;
  onSelect: (unitId: string) => void;
  /** Doble clic: enfocar la unidad. */
  onFocusUnit: (unitId: string) => void;
  camCommand: CamCommand | null;
  zoomRequest: { n: number; dir: number };
  layers: SceneLayers;
  /** Rack aislado: los demás racks y su inventario se ocultan. */
  isolatedRackId: string | null;
}

type Inst = { p: Vec3; s: Vec3; c?: string; r?: Vec3 };

/** Muchas piezas iguales en una sola llamada de dibujo. `ids[i]` identifica la instancia para clic/hover. */
function InstancedBoxes({ items, color = '#ffffff', ids, onPick, onHover, onDouble, opacity, shadows = true, metal = 0 }: {
  items: Inst[]; color?: string; ids?: string[]; onPick?: (id: string) => void; onHover?: (id: string | null) => void;
  onDouble?: (id: string) => void; opacity?: number; shadows?: boolean; metal?: number;
}) {
  const translucent = opacity !== undefined && opacity < 0.6;
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      q.setFromEuler(it.r ? e.set(...it.r) : e.set(0, 0, 0));
      m.compose(new THREE.Vector3(...it.p), q, new THREE.Vector3(...it.s));
      mesh.setMatrixAt(i, m);
      if (it.c) mesh.setColorAt(i, c.set(it.c));
    });
    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  const id = (ev: ThreeEvent<PointerEvent | MouseEvent>) => (ids && ev.instanceId !== undefined ? ids[ev.instanceId] : undefined);
  return (
    <instancedMesh
      key={items.length}
      ref={ref}
      args={[undefined, undefined, Math.max(items.length, 1)]}
      castShadow={shadows && !translucent}
      receiveShadow={shadows && !translucent}
      raycast={onPick ? undefined : () => null}
      onClick={onPick ? (ev) => { const x = id(ev); if (x) { ev.stopPropagation(); onPick(x); } } : undefined}
      onDoubleClick={onDouble ? (ev) => { const x = id(ev); if (x) { ev.stopPropagation(); onDouble(x); } } : undefined}
      onPointerMove={onHover ? (ev) => { const x = id(ev); if (x) { ev.stopPropagation(); onHover(x); document.body.style.cursor = 'pointer'; } } : undefined}
      onPointerOut={onHover ? () => { onHover(null); document.body.style.cursor = 'auto'; } : undefined}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} depthWrite={!translucent} metalness={metal} roughness={metal ? 0.45 : 0.85} />
    </instancedMesh>
  );
}

/** Texto como textura (sin DOM ni fuentes externas). Plano horizontal (piso) o vertical (letrero). */
function TextPlane({ text, position, height, color = '#171827', bg, rotation = [-Math.PI / 2, 0, 0], weight = 800 }: {
  text: string; position: Vec3; height: number; color?: string; bg?: string; rotation?: Vec3; weight?: number;
}) {
  const { texture, aspect } = useMemo(() => {
    const font = `${weight} 96px "Inter Variable", "Segoe UI", system-ui, sans-serif`;
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d');
    if (ctx) ctx.font = font;
    const tw = ctx ? Math.ceil(ctx.measureText(text).width) : text.length * 60;
    canvas.width = tw + 48; canvas.height = 128;
    ctx = canvas.getContext('2d');
    if (ctx) {
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
      ctx.fillText(text, canvas.width / 2, 68);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return { texture: t, aspect: canvas.width / canvas.height };
  }, [text, color, bg, weight]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh rotation={rotation} position={position} raycast={() => null}>
      <planeGeometry args={[height * aspect, height]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}

/** Desactiva el raycast de un subárbol (elementos ambientales: nunca bloquean la selección). */
function NoPick({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useLayoutEffect(() => { g.current?.traverse((o) => { (o as THREE.Mesh).raycast = () => {}; }); });
  return <group ref={g}>{children}</group>;
}

/** Racks industriales: postes azules, largueros naranja, riostras, bandejas de malla y protectores. */
/** Modo de los racks: sólidos, transparentes (por defecto: el inventario se ve y se selecciona) u ocultos. */
import type { RackMode } from './TwinView';

function Racks({ racks, mode }: { racks: { position: Vec3 }[]; mode: RackMode }) {
  const parts = useMemo(() => {
    const posts: Inst[] = []; const beams: Inst[] = []; const decks: Inst[] = []; const braces: Inst[] = []; const guards: Inst[] = []; const plates: Inst[] = [];
    for (const { position: [x, , z] } of racks) {
      for (let b = 0; b <= 5; b += 1) {
        const pz = z - RACK_LENGTH / 2 + b * BAY_W;
        for (const dx of [-RACK_DEPTH / 2, RACK_DEPTH / 2]) {
          posts.push({ p: [x + dx, RACK_HEIGHT / 2, pz], s: [0.08, RACK_HEIGHT, 0.08] });
          plates.push({ p: [x + dx, 0.015, pz], s: [0.18, 0.03, 0.18] });
        }
        // Riostras del bastidor lateral (zigzag entre poste delantero y trasero).
        for (let k = 0; k < 3; k += 1) {
          const y = 0.3 + k * 1.1;
          braces.push({ p: [x, y + 0.55, pz], s: [0.025, 1.35, 0.025], r: [0, 0, (k % 2 ? 1 : -1) * Math.atan2(RACK_DEPTH, 1.1)] });
          braces.push({ p: [x, y, pz], s: [RACK_DEPTH, 0.025, 0.025] });
        }
      }
      for (let l = 1; l <= LEVELS; l += 1) {
        const y = l * LEVEL_HEIGHT;
        for (const dx of [-RACK_DEPTH / 2, RACK_DEPTH / 2]) beams.push({ p: [x + dx, y, z], s: [0.07, 0.12, RACK_LENGTH] });
        if (l < LEVELS) decks.push({ p: [x, y + 0.05, z], s: [RACK_DEPTH - 0.04, 0.02, RACK_LENGTH] });
      }
      // Protectores de extremo (amarillos) en ambas cabeceras del rack.
      for (const ez of [z - RACK_LENGTH / 2 - 0.12, z + RACK_LENGTH / 2 + 0.12]) guards.push({ p: [x, 0.18, ez], s: [RACK_DEPTH + 0.1, 0.36, 0.1] });
    }
    return { posts, beams, decks, braces, guards, plates };
  }, [racks]);
  if (mode === 'hidden') return null;
  const t = mode === 'transparent';
  // Estructura ligera: en modo transparente postes y largueros se ven, pero no tapan las cajas.
  return (
    <>
      <InstancedBoxes items={parts.posts} color="#2f5fb3" metal={0.4} opacity={t ? 0.55 : undefined} />
      <InstancedBoxes items={parts.beams} color="#f08a24" metal={0.3} opacity={t ? 0.5 : undefined} />
      <InstancedBoxes items={parts.decks} color="#c9ced8" opacity={t ? 0.18 : 0.9} metal={0.5} />
      {!t && <InstancedBoxes items={parts.braces} color="#3b6cc4" metal={0.4} shadows={false} />}
      <InstancedBoxes items={parts.guards} color="#f5c518" opacity={t ? 0.6 : undefined} />
      <InstancedBoxes items={parts.plates} color="#8b93a3" shadows={false} />
    </>
  );
}

/** Señalización de piso: líneas amarillas, rombos con la letra del pasillo y letreros colgantes. */
function Signage({ zones, aisles, racks, width }: {
  zones: ReturnType<typeof zoneLayouts>; aisles: ReturnType<typeof aisleLayouts>; racks: { position: Vec3 }[]; width: number;
}) {
  const lines = useMemo(() => {
    const out: Inst[] = [];
    for (const { position: [x, , z] } of racks) {
      for (const dx of [-(RACK_DEPTH / 2 + 0.16), RACK_DEPTH / 2 + 0.16]) out.push({ p: [x + dx, 0.012, z], s: [0.07, 0.01, RACK_LENGTH + 0.5] });
    }
    const front = STORAGE_Z + RACK_LENGTH / 2 + 0.35;
    out.push({ p: [0, 0.012, front], s: [width - 2, 0.01, 0.08] });
    out.push({ p: [0, 0.012, DOCK_Z - 2.25], s: [width - 2, 0.01, 0.08] });
    for (let n = 1; n <= 4; n += 1) {
      const cx = (n - 2.5) * 3;
      for (const [dx, dz, sx, sz] of [[0, -0.85, 1.8, 0.07], [0, 0.85, 1.8, 0.07], [-0.9, 0, 0.07, 1.7], [0.9, 0, 0.07, 1.7]]) {
        out.push({ p: [cx + dx, 0.012, DOCK_Z + dz], s: [sx, 0.01, sz] });
      }
    }
    return out;
  }, [racks, width]);
  const letter = (a: number) => 'ABCDEF'[a - 1] ?? String(a);
  return (
    <>
      <InstancedBoxes items={lines} color="#f5c518" shadows={false} />
      {aisles.map((a) => (
        <group key={a.aisle}>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position={[a.x, 0.014, STORAGE_Z + RACK_LENGTH / 2 + 1.25]} raycast={() => null}>
            <planeGeometry args={[0.95, 0.95]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <TextPlane text={letter(a.aisle)} position={[a.x, 0.02, STORAGE_Z + RACK_LENGTH / 2 + 1.25]} height={0.62} />
          {/* Letrero colgante sobre la entrada del pasillo */}
          <mesh position={[a.x, RACK_HEIGHT + 1.15, STORAGE_Z + RACK_LENGTH / 2 + 0.2]} raycast={() => null}>
            <boxGeometry args={[1.0, 0.62, 0.05]} />
            <meshStandardMaterial color="#17142f" />
          </mesh>
          <TextPlane text={`Pasillo ${letter(a.aisle)}`} position={[a.x, RACK_HEIGHT + 1.15, STORAGE_Z + RACK_LENGTH / 2 + 0.24]} height={0.26} color="#ffffff" rotation={[0, 0, 0]} weight={700} />
          {[-0.4, 0.4].map((dx) => (
            <mesh key={dx} position={[a.x + dx, RACK_HEIGHT + 1.8, STORAGE_Z + RACK_LENGTH / 2 + 0.2]} raycast={() => null}>
              <boxGeometry args={[0.015, 0.7, 0.015]} />
              <meshStandardMaterial color="#5b6170" />
            </mesh>
          ))}
        </group>
      ))}
      {zones.filter((z) => z.zone.kind !== 'RECEIVING').map(({ zone, center }) => (
        <TextPlane key={zone.id} text={`${zone.name} · ${zone.category ?? ''}`} position={[center[0], 0.02, STORAGE_Z - RACK_LENGTH / 2 - 0.9]} height={0.42} color="rgba(102,112,133,0.9)" weight={650} />
      ))}
      <TextPlane text="Recepción" position={[-8.2, 0.02, DOCK_Z]} height={0.5} color="rgba(102,112,133,0.95)" weight={700} />
    </>
  );
}

/** Edificio: muros (corte bajo del lado de la cámara), muelles D1/D2 con cortinas, topes y bolardos. */
function Building({ width, truck, walls, decor }: { width: number; truck: boolean; walls: boolean; decor: boolean }) {
  const back = STORAGE_Z - RACK_LENGTH / 2 - 2.4;
  const depth = FRONT_Z - back;
  const midZ = (FRONT_Z + back) / 2;
  const doors = [{ x: 0, name: 'D1' }, { x: D2_X, name: 'D2' }];
  return (
    <NoPick>
      {walls && (
        <>
          <mesh position={[0, 2.5, back]} receiveShadow><boxGeometry args={[width, 5, 0.25]} /><meshStandardMaterial color="#dfe3ea" /></mesh>
          <mesh position={[0, 0.35, back + 0.14]}><boxGeometry args={[width, 0.7, 0.04]} /><meshStandardMaterial color="#c3c8d3" /></mesh>
          <mesh position={[width / 2, 2.5, midZ]} receiveShadow><boxGeometry args={[0.25, 5, depth]} /><meshStandardMaterial color="#e4e7ee" /></mesh>
          <mesh position={[-width / 2, 0.6, midZ]}><boxGeometry args={[0.25, 1.2, depth]} /><meshStandardMaterial color="#e4e7ee" /></mesh>
        </>
      )}
      {decor && doors.map((d) => (
        <group key={d.name} position={[d.x, 0, FRONT_Z]}>
          {[-1.9, 1.9].map((dx) => (
            <mesh key={dx} position={[dx, 1.9, 0]} castShadow><boxGeometry args={[0.28, 3.8, 0.3]} /><meshStandardMaterial color="#9aa1ae" metalness={0.3} /></mesh>
          ))}
          <mesh position={[0, 3.95, 0]}><boxGeometry args={[4.1, 0.5, 0.32]} /><meshStandardMaterial color="#5b6170" /></mesh>
          <mesh position={[0, 3.55, 0.05]}><boxGeometry args={[3.5, 0.45, 0.2]} /><meshStandardMaterial color="#c3c8d3" metalness={0.4} /></mesh>
          <TextPlane text={d.name} position={[0, 3.95, 0.18]} height={0.36} color="#ffffff" bg="#17142f" rotation={[0, 0, 0]} />
          {[-1.3, 1.3].map((dx) => (
            <mesh key={dx} position={[dx, 0.55, 0.22]}><boxGeometry args={[0.32, 0.45, 0.18]} /><meshStandardMaterial color="#1f2229" /></mesh>
          ))}
          <mesh position={[0, 0.015, -0.6]} receiveShadow><boxGeometry args={[2.6, 0.03, 1.4]} /><meshStandardMaterial color="#8b93a3" metalness={0.6} roughness={0.4} /></mesh>
          {[-2.4, 2.4].map((dx) => (
            <group key={dx} position={[dx, 0, -0.5]}>
              <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.1, 0.1, 1.0, 14]} /><meshStandardMaterial color="#f5c518" /></mesh>
              {[0.3, 0.7].map((y) => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.105, 0.105, 0.12, 14]} /><meshStandardMaterial color="#1f2229" /></mesh>)}
            </group>
          ))}
        </group>
      ))}
      {truck && (
        <group position={[0, 0, FRONT_Z + 3.6]}>
          <mesh position={[0, 1.6, 0]} castShadow><boxGeometry args={[2.5, 2.7, 4.8]} /><meshStandardMaterial color="#f6f7fa" /></mesh>
          <mesh position={[0, 1.15, 3.1]} castShadow><boxGeometry args={[2.4, 1.9, 1.4]} /><meshStandardMaterial color="#6336e8" /></mesh>
          <mesh position={[0, 1.55, 3.82]}><boxGeometry args={[2.0, 0.7, 0.02]} /><meshStandardMaterial color="#2a2f3a" metalness={0.6} roughness={0.2} /></mesh>
          {[-1.7, 1.7, 3.1].map((z) => [-1.12, 1.12].map((x) => (
            <mesh key={`${x},${z}`} position={[x, 0.4, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.4, 0.4, 0.3, 18]} /><meshStandardMaterial color="#20232b" /></mesh>
          )))}
        </group>
      )}
    </NoPick>
  );
}

/** Portal RFID (evento): arco con 2 antenas, lector, letrero y luz de estado; destella en cada lectura. */
function RfidPortal({ readCount, reading }: { readCount: number; reading: boolean }) {
  const field = useRef<THREE.MeshBasicMaterial>(null);
  const antennas = useRef<THREE.MeshStandardMaterial[]>([]);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const last = useRef(-10);
  const clock = useRef(0);
  useEffect(() => { if (readCount > 0) last.current = clock.current; }, [readCount]);
  useFrame((_, dt) => {
    clock.current += dt;
    const k = Math.max(0, 1 - (clock.current - last.current) / 0.45);
    if (field.current) field.current.opacity = (reading ? 0.08 : 0.03) + 0.4 * k;
    for (const m of antennas.current) if (m) m.emissiveIntensity = 1.4 * k;
    if (lamp.current) lamp.current.emissive.set(k > 0.05 || reading ? EVENT_COLOR.selected : EVENT_COLOR.verified);
  });
  return (
    <NoPick>
      <group position={[0, 0, PORTAL_Z]}>
        {[-1.7, 1.7].map((x, i) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 1.45, 0]} castShadow><boxGeometry args={[0.16, 2.9, 0.16]} /><meshStandardMaterial color="#17142f" /></mesh>
            <mesh position={[-Math.sign(x) * 0.13, 1.55, 0]}>
              <boxGeometry args={[0.07, 0.6, 0.6]} />
              <meshStandardMaterial ref={(m) => { if (m) antennas.current[i] = m; }} color="#ece8ff" emissive="#7c4dff" emissiveIntensity={0} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 2.95, 0]}><boxGeometry args={[3.6, 0.18, 0.2]} /><meshStandardMaterial color="#17142f" /></mesh>
        <TextPlane text="RFID" position={[0, 2.95, 0.12]} height={0.15} color="#ffffff" rotation={[0, 0, 0]} />
        <mesh position={[1.98, 1.25, 0]}><boxGeometry args={[0.3, 0.4, 0.14]} /><meshStandardMaterial color="#6336e8" /></mesh>
        <mesh position={[1.98, 1.52, 0.04]}><sphereGeometry args={[0.06, 12, 12]} /><meshStandardMaterial ref={lamp} color="#ffffff" emissive={EVENT_COLOR.verified} emissiveIntensity={1.6} /></mesh>
        <mesh position={[0, 1.45, 0]}>
          <boxGeometry args={[3.2, 2.8, 0.5]} />
          <meshBasicMaterial ref={field} color="#7c4dff" transparent opacity={0.03} depthWrite={false} />
        </mesh>
      </group>
    </NoPick>
  );
}

/** Animación del evento de recepción: el pallet entrante avanza del camión al portal mientras se leen etiquetas. */
function IncomingPallet({ progress, remaining, poId }: { progress: number; remaining: number; poId: string }) {
  const g = useRef<THREE.Group>(null);
  const goal = useMemo(() => new THREE.Vector3(0, 0, FRONT_Z + 0.8 - progress * (FRONT_Z + 0.8 - (PORTAL_Z - 0.4))), [progress]);
  useFrame((_, dt) => { if (g.current) g.current.position.lerp(goal, Math.min(1, dt * 3)); });
  const boxes = Array.from({ length: Math.max(0, remaining) }, (_, i) => i);
  return (
    <group ref={g} position={[0, 0, FRONT_Z + 0.8]}>
      <NoPick>
        <mesh position={[0, 0.07, 0]} castShadow><boxGeometry args={[1.0, 0.12, 1.22]} /><meshStandardMaterial color="#a8835a" /></mesh>
        {boxes.map((i) => (
          <mesh key={i} position={[((i % 4) % 2 ? 0.25 : -0.25), 0.29 + Math.floor(i / 4) * 0.35, (Math.floor((i % 4) / 2) ? 0.29 : -0.29)]} castShadow>
            <boxGeometry args={[0.46, 0.33, 0.54]} />
            <meshStandardMaterial color={familyColor('COL')} emissive="#7c4dff" emissiveIntensity={0.12} />
          </mesh>
        ))}
      </NoPick>
      <Html position={[0, 1.9, 0]} center pointerEvents="none" zIndexRange={[15, 5]}>
        <div className="label3d-operator">Leyendo {poId}</div>
      </Html>
    </group>
  );
}

/** Cuerpo del montacargas (sin lógica). Las horquillas apuntan a +Z local. */
function ForkliftBody({ beacon }: { beacon?: React.Ref<THREE.MeshStandardMaterial> }) {
  return (
    <NoPick>
      <mesh position={[0, 0.55, 0]} castShadow><boxGeometry args={[0.95, 0.65, 1.5]} /><meshStandardMaterial color="#e8b422" /></mesh>
      <mesh position={[0, 0.65, -0.62]} castShadow><boxGeometry args={[0.95, 0.85, 0.3]} /><meshStandardMaterial color="#2a2f3a" /></mesh>
      {[[-0.42, -0.45], [0.42, -0.45], [-0.42, 0.35], [0.42, 0.35]].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, 1.35, z]}><boxGeometry args={[0.05, 0.95, 0.05]} /><meshStandardMaterial color="#2a2f3a" /></mesh>
      ))}
      <mesh position={[0, 1.83, -0.05]}><boxGeometry args={[0.95, 0.05, 0.9]} /><meshStandardMaterial color="#2a2f3a" /></mesh>
      <mesh position={[0, 0.85, 0.08]}><boxGeometry args={[0.45, 0.08, 0.45]} /><meshStandardMaterial color="#1f2229" /></mesh>
      {[-0.3, 0.3].map((x) => <mesh key={x} position={[x, 1.2, 0.82]}><boxGeometry args={[0.07, 2.1, 0.07]} /><meshStandardMaterial color="#3a404c" metalness={0.5} /></mesh>)}
      {[-0.22, 0.22].map((x) => <mesh key={x} position={[x, 0.12, 1.35]}><boxGeometry args={[0.1, 0.05, 1.0]} /><meshStandardMaterial color="#3a404c" metalness={0.5} /></mesh>)}
      {[[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.5], [0.5, 0.5]].map(([x, z]) => (
        <mesh key={`w${x},${z}`} position={[x, 0.22, z]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.22, 0.22, 0.18, 14]} /><meshStandardMaterial color="#1f2229" /></mesh>
      ))}
      <mesh position={[0, 1.9, -0.3]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial ref={beacon} color="#ffd27a" emissive="#ff9f1a" emissiveIntensity={0.6} /></mesh>
    </NoPick>
  );
}

/** Montacargas AMBIENTAL: recorre un pasillo transversal; no transporta inventario ni es seleccionable. */
function Forklift({ lane, phase, speed, running }: { lane: number; phase: number; speed: number; running: boolean }) {
  const g = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.MeshStandardMaterial>(null);
  const t = useRef(phase);
  useFrame((_, dt) => {
    if (!g.current) return;
    if (running) t.current += dt * speed;
    const cyc = t.current % 2;
    const forward = cyc < 1;
    const u = forward ? cyc : 2 - cyc;
    const e = u * u * (3 - 2 * u); // easing suave en los extremos
    g.current.position.set(-15 + 30 * e, 0, lane);
    const targetRot = forward ? Math.PI / 2 : -Math.PI / 2;
    g.current.rotation.y += (targetRot - g.current.rotation.y) * Math.min(1, dt * 3);
    if (beacon.current) beacon.current.emissiveIntensity = running ? 0.6 + 0.6 * Math.max(0, Math.sin(t.current * 18)) : 0.2;
  });
  return <group ref={g}><ForkliftBody beacon={beacon} /></group>;
}

interface UnitBoxes { boxes: Inst[]; boxIds: string[]; pallets: Inst[]; palletIds: string[]; footprint: Map<string, { p: Vec3; h: number }> }

/** Coloca pallets y cajas: color del producto; el estado solo tiñe excepciones; selección en morado. */
function layoutUnits(units: LogisticUnit[], lotSku: Map<string, string>, locPos: Map<string, Vec3>, selectedId: string | null, hoveredId: string | null, visibleLoc: (locId: string) => boolean): UnitBoxes {
  const children = new Map<string, LogisticUnit[]>();
  for (const u of units) if (u.parentId) children.set(u.parentId, [...(children.get(u.parentId) ?? []), u]);
  const roots = new Map<string, LogisticUnit[]>();
  for (const u of units) if (!u.parentId) roots.set(u.expectedLocationId, [...(roots.get(u.expectedLocationId) ?? []), u]);
  const colorOf = (root: LogisticUnit, box: LogisticUnit) => {
    if (root.id === selectedId) return SELECTED_BOX;
    if (root.id === hoveredId) return HOVER_BOX;
    if (root.verificationStatus === 'PENDING_VERIFICATION') return EVENT_COLOR.pending;
    if (root.verificationStatus === 'CONFIRMED') return EVENT_COLOR.verified;
    return familyColor(lotSku.get(box.lotId ?? '') ?? null);
  };
  const out: UnitBoxes = { boxes: [], boxIds: [], pallets: [], palletIds: [], footprint: new Map() };
  const slot = (i: number): [number, number, number] => [((i % 4) % 2 === 0 ? -0.25 : 0.25), Math.floor(i / 4), (Math.floor((i % 4) / 2) === 0 ? -0.29 : 0.29)];
  for (const [locId, list] of roots) {
    const base = locPos.get(locId);
    if (!base || !visibleLoc(locId)) continue;
    let i = 0;
    for (const u of list) {
      if (u.type === 'PALLET') {
        out.pallets.push({ p: [base[0], base[1] + 0.06, base[2]], s: [1.0, 0.12, 1.22] });
        out.palletIds.push(u.id);
        let top = 0.12;
        (children.get(u.id) ?? []).forEach((k, j) => {
          const [dx, layer, dz] = slot(j);
          out.boxes.push({ p: [base[0] + dx, base[1] + 0.12 + 0.17 + layer * 0.35, base[2] + dz], s: [0.46, 0.33, 0.54], c: colorOf(u, k) });
          out.boxIds.push(u.id);
          top = Math.max(top, 0.12 + 0.35 * (layer + 1));
        });
        out.footprint.set(u.id, { p: base, h: top });
      } else {
        const [dx, layer, dz] = slot(i);
        out.boxes.push({ p: [base[0] + dx, base[1] + 0.17 + layer * 0.35, base[2] + dz], s: [0.46, 0.33, 0.54], c: colorOf(u, u) });
        out.boxIds.push(u.id);
        out.footprint.set(u.id, { p: [base[0] + dx, base[1] + layer * 0.35, base[2] + dz], h: 0.35 });
        i += 1;
      }
    }
  }
  return out;
}

/** Tooltip compacto orientado al producto: nombre → SKU · cantidad → pallet → ubicación (+ detectada). */
function UnitTooltip({ state, unit, position, pending }: { state: DemoState; unit: LogisticUnit; position: Vec3; pending: boolean }) {
  const c = unitContents(state, unit);
  const Icon = productIcon(c.skuId);
  const mismatch = unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId;
  return (
    <Html position={[position[0], RACK_HEIGHT + 0.7, position[2]]} pointerEvents="none" zIndexRange={[20, 16]} style={{ transform: 'translate(-50%, -100%)' }}>
      <div className={`tip${pending ? ' is-pending' : ''}`} data-testid="unit-callout">
        <div className="tip-title"><Icon size={15} /> {c.title}</div>
        <div className="tip-sub">{c.subtitle}</div>
        <div className="tip-ref">{unit.id}</div>
        <div className="tip-loc"><MapPin size={13} /> {unit.expectedLocationId}</div>
        {mismatch && <div className="tip-loc detected"><MapPin size={13} /> Detectada: {unit.observedLocationId}</div>}
      </div>
    </Html>
  );
}

function ObservationGhost({ position, unitId, locationId, label }: { position: Vec3; unitId: string; locationId: string; label: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = (t.current + dt) % 1.6;
    if (ring.current) { ring.current.scale.setScalar(0.8 + t.current * 0.8); (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t.current / 1.6); }
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.45, 0]} raycast={() => null}>
        <boxGeometry args={[1.0, 0.9, 1.22]} />
        <meshStandardMaterial color={EVENT_COLOR.pending} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.45, 0]} raycast={() => null}><boxGeometry args={[1.04, 0.94, 1.26]} /><meshBasicMaterial color={EVENT_COLOR.pending} wireframe /></mesh>
      <mesh ref={ring} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.7, 0.78, 40]} /><meshBasicMaterial color={EVENT_COLOR.pending} transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {label && (
        <Html position={[0, -0.25, 0.9]} center pointerEvents="none" zIndexRange={[15, 5]}>
          <div className="label3d-ghost">Detectado: {unitId} <small>· {locationId}</small></div>
        </Html>
      )}
    </group>
  );
}

/** Operario con lector de mano (evento simulado): camina hasta la última etiqueta leída y emite un pulso. */
function HandheldOperator({ target, readKey, label }: { target: Vec3; readKey: string; label: boolean }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const goal = useMemo(() => new THREE.Vector3(...target), [target]);
  const pulse = useRef(0);
  useEffect(() => { pulse.current = 0; }, [readKey]);
  useFrame((_, dt) => {
    if (group.current) {
      if (group.current.position.lengthSq() === 0) group.current.position.copy(goal);
      group.current.position.lerp(goal, Math.min(1, dt * 6));
    }
    pulse.current += dt;
    const k = Math.min(1, pulse.current / 0.6);
    if (ring.current) ring.current.scale.setScalar(0.4 + k * 2.2);
    if (ringMat.current) ringMat.current.opacity = 0.6 * (1 - k);
  });
  return (
    <group ref={group}>
      <NoPick>
        <mesh position={[0, 0.55, 0]} castShadow><cylinderGeometry args={[0.22, 0.26, 1.1, 16]} /><meshStandardMaterial color="#6336e8" /></mesh>
        <mesh position={[0, 1.3, 0]}><sphereGeometry args={[0.2, 16, 16]} /><meshStandardMaterial color="#f0c9a0" /></mesh>
        <mesh position={[0, 1.42, 0]}><cylinderGeometry args={[0.22, 0.22, 0.08, 16]} /><meshStandardMaterial color="#f5c518" /></mesh>
        <mesh position={[0.28, 0.85, 0.12]}><boxGeometry args={[0.1, 0.22, 0.06]} /><meshStandardMaterial color="#17142f" /></mesh>
        <mesh ref={ring} position={[0, 0.9, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.5, 0.03, 8, 32]} />
          <meshBasicMaterial ref={ringMat} color="#7c4dff" transparent opacity={0} depthWrite={false} />
        </mesh>
      </NoPick>
      {label && (
        <Html position={[0, 2.0, 0]} center pointerEvents="none" zIndexRange={[14, 5]}>
          <div className="label3d-operator">Lector de mano</div>
        </Html>
      )}
    </group>
  );
}

/** Resaltado del pallet seleccionado: contorno morado y anillo de luz suave en el piso de su ubicación. */
function SelectionHighlight({ foot }: { foot: { p: Vec3; h: number } }) {
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const t = useRef(0);
  useFrame((_, dt) => { t.current += dt; if (ring.current) ring.current.opacity = 0.35 + 0.25 * Math.sin(t.current * 3); });
  const h = Math.max(foot.h, 0.4);
  return (
    <group position={foot.p}>
      <mesh position={[0, h / 2 + 0.02, 0]} raycast={() => null}>
        <boxGeometry args={[1.14, h + 0.12, 1.34]} />
        <meshBasicMaterial color={EVENT_COLOR.selected} wireframe />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.75, 0.95, 40]} />
        <meshBasicMaterial ref={ring} color={EVENT_COLOR.selected} transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Pallet con sus cajas (para el traslado; no seleccionable). Base en y = 0 local. */
function LoadMesh({ boxes, color }: { boxes: number; color: string }) {
  const slot = (i: number): Vec3 => [((i % 4) % 2 === 0 ? -0.25 : 0.25), 0.12 + 0.17 + Math.floor(i / 4) * 0.35, (Math.floor((i % 4) / 2) === 0 ? -0.29 : 0.29)];
  return (
    <NoPick>
      <mesh position={[0, 0.06, 0]} castShadow><boxGeometry args={[1.0, 0.12, 1.22]} /><meshStandardMaterial color="#a8835a" /></mesh>
      {Array.from({ length: boxes }, (_, i) => (
        <mesh key={i} position={slot(i)} castShadow><boxGeometry args={[0.46, 0.33, 0.54]} /><meshStandardMaterial color={color} emissive="#7c4dff" emissiveIntensity={0.18} /></mesh>
      ))}
    </NoPick>
  );
}

interface TransferLeg { unitId: string; boxes: number; color: string; origin: Vec3; aisleX: number; staging: Vec3 }
const LEG_SECONDS = 5.5;
const FRONT_LANE_Z = STORAGE_Z + RACK_LENGTH / 2 + 1.35;

/** Posición a lo largo de una polilínea en el piso (u ∈ [0,1]) y la dirección del tramo. */
function along(points: Vec3[], u: number): { p: Vec3; dir: [number, number] } {
  const segs = points.slice(1).map((b, i) => { const a = points[i]; return { a, b, len: Math.hypot(b[0] - a[0], b[2] - a[2]) }; });
  const total = segs.reduce((t, x) => t + x.len, 0) || 1;
  let d = Math.min(1, Math.max(0, u)) * total;
  for (let i = 0; i < segs.length; i += 1) {
    const sg = segs[i];
    if (d <= sg.len || i === segs.length - 1) {
      const k = sg.len ? Math.min(1, d / sg.len) : 1;
      return { p: [sg.a[0] + (sg.b[0] - sg.a[0]) * k, 0, sg.a[2] + (sg.b[2] - sg.a[2]) * k], dir: [sg.b[0] - sg.a[0], sg.b[2] - sg.a[2]] };
    }
    d -= sg.len;
  }
  return { p: points[points.length - 1], dir: [0, 1] };
}

const legPath = (L: TransferLeg): Vec3[] => [
  [L.aisleX, 0, L.origin[2]], [L.aisleX, 0, FRONT_LANE_Z], [L.staging[0], 0, FRONT_LANE_Z], [L.staging[0], 0, L.staging[2] - 1.2],
];

/**
 * Ejecución SIMULADA de un traslado registrado: el montacargas saca cada pallet del movimiento de su ubicación de
 * origen y lo deja en el muelle de salida. La animación usa los datos del movimiento (pallets, ubicaciones, muelle).
 */
function TransferRun({ legs, reduced, label }: { legs: TransferLeg[]; reduced: boolean; label: string | null }) {
  const total = legs.length * LEG_SECONDS;
  const t = useRef(reduced ? total : 0);
  const truck = useRef<THREE.Group>(null);
  const loads = useRef<(THREE.Group | null)[]>([]);
  const [done, setDone] = useState(reduced);
  useFrame((_, dt) => {
    t.current = Math.min(total, t.current + dt);
    const leg = Math.min(legs.length - 1, Math.floor(t.current / LEG_SECONDS));
    const u = t.current >= total ? 1 : (t.current - leg * LEG_SECONDS) / LEG_SECONDS;
    legs.forEach((L, i) => {
      const g = loads.current[i];
      if (!g) return;
      if (i < leg || (i === leg && u >= 1)) { g.position.set(...L.staging); return; }
      if (i > leg) { g.position.set(...L.origin); return; }
      // Fases: 0–0.18 sacar del rack y bajar a las horquillas · 0.18–0.92 viaje · 0.92–1 dejar en el muelle.
      const path = legPath(L);
      if (u < 0.18) {
        const k = u / 0.18;
        const e = k * k * (3 - 2 * k);
        g.position.set(L.origin[0] + (L.aisleX - L.origin[0]) * e * 0.55, L.origin[1] * (1 - e) + 0.2 * e, L.origin[2]);
      } else if (u < 0.92) {
        const { p } = along(path, (u - 0.18) / 0.74);
        g.position.set(p[0], 0.2, p[2]);
      } else {
        const k = (u - 0.92) / 0.08;
        const end = path[path.length - 1];
        g.position.set(end[0], 0.2 * (1 - k), end[2] + (L.staging[2] - end[2]) * k);
      }
    });
    // El montacargas acompaña la carga del tramo actual (las horquillas quedan bajo el pallet).
    const L = legs[leg];
    const g = loads.current[leg];
    if (truck.current && L && g) {
      const dir: [number, number] = u < 0.18 ? [L.origin[0] - L.aisleX, 0] : u < 0.92 ? along(legPath(L), (u - 0.18) / 0.74).dir : [0, 1];
      const yaw = Math.atan2(dir[0], dir[1]);
      truck.current.rotation.y = yaw;
      truck.current.position.set(g.position.x - Math.sin(yaw) * 1.35, 0, g.position.z - Math.cos(yaw) * 1.35);
      truck.current.visible = t.current < total;
    }
    if (!done && t.current >= total) setDone(true);
  });
  const last = legs[legs.length - 1];
  return (
    <group>
      <group ref={truck}><ForkliftBody /></group>
      {legs.map((L, i) => (
        <group key={L.unitId} ref={(el) => { loads.current[i] = el; }} position={reduced ? L.staging : L.origin}>
          <LoadMesh boxes={L.boxes} color={L.color} />
        </group>
      ))}
      {legs.map((L) => (
        <mesh key={`o-${L.unitId}`} position={[L.origin[0], L.origin[1] + 0.02, L.origin[2]]} raycast={() => null}>
          <boxGeometry args={[1.14, 0.04, 1.34]} /><meshBasicMaterial color={EVENT_COLOR.selected} wireframe />
        </mesh>
      ))}
      {label && last && (
        <Html position={[D2_X, 2.3, last.staging[2]]} center pointerEvents="none" zIndexRange={[15, 5]}>
          <div className="label3d-operator" data-testid="transfer-label">{done ? `En muelle D2 · ${label}` : `Trasladando · ${label}`}</div>
        </Html>
      )}
    </group>
  );
}

/** Pallets del traslado aprobado (aún en su rack): contorno morado para identificar el inventario involucrado. */
function PlannedHighlight({ feet }: { feet: { p: Vec3; h: number }[] }) {
  return (
    <>
      {feet.map((f) => (
        <mesh key={f.p.join(',')} position={[f.p[0], f.p[1] + Math.max(f.h, 0.4) / 2 + 0.02, f.p[2]]} raycast={() => null}>
          <boxGeometry args={[1.14, Math.max(f.h, 0.4) + 0.12, 1.34]} />
          <meshBasicMaterial color={EVENT_COLOR.selected} wireframe />
        </mesh>
      ))}
    </>
  );
}

/** Cámara: vuelos suaves a la meta indicada (vista general, superior, paso, unidad o rack) y zoom con los botones. */
function CameraRig({ goal, zoom }: { goal: { key: number; target: Vec3; pos: Vec3 } | null; zoom: { n: number; dir: number } }) {
  const camera = useThree((st) => st.camera);
  const controls = useThree((st) => st.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const camGoal = useRef<THREE.Vector3 | null>(null);
  const targetGoal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    if (!goal) return;
    targetGoal.current = new THREE.Vector3(...goal.target);
    camGoal.current = new THREE.Vector3(...goal.pos);
  }, [goal?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (zoom.n === 0 || !controls) return;
    const dir = camera.position.clone().sub(controls.target);
    const len = THREE.MathUtils.clamp(dir.length() * (zoom.dir > 0 ? 0.78 : 1.28), 4, 60);
    camGoal.current = controls.target.clone().add(dir.setLength(len));
    targetGoal.current = controls.target.clone();
  }, [zoom.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dt) => {
    if (!controls || !camGoal.current || !targetGoal.current) return;
    const k = Math.min(1, dt * 3.2);
    camera.position.lerp(camGoal.current, k);
    controls.target.lerp(targetGoal.current, k);
    controls.update();
    if (camera.position.distanceTo(camGoal.current) < 0.03 && controls.target.distanceTo(targetGoal.current) < 0.03) { camGoal.current = null; targetGoal.current = null; }
  });
  return null;
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

const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function SceneContent({ state, expiryRiskLots, onSelect, onFocusUnit, camCommand, zoomRequest, layers, isolatedRackId }: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [lowPower, setLowPower] = useState(false);
  const reduced = useMemo(prefersReducedMotion, []);
  const zones = useMemo(() => zoneLayouts(state.zones), [state.zones]);
  const racks = useMemo(() => rackLayouts(state.zones, state.racks), [state.zones, state.racks]);
  const storageRacks = useMemo(() => racks.filter((r) => r.storage && (!isolatedRackId || r.rack.id === isolatedRackId)), [racks, isolatedRackId]);
  const allStorageRacks = useMemo(() => racks.filter((r) => r.storage), [racks]);
  const locRack = useMemo(() => new Map(state.locations.map((l) => [l.id, l.rackId])), [state.locations]);
  const aisles = useMemo(() => aisleLayouts(state.zones, state.racks), [state.zones, state.racks]);
  const locPos = useMemo(() => locationPositions(state.zones, state.racks, state.locations), [state.zones, state.racks, state.locations]);
  const lotSku = useMemo(() => new Map(state.lots.map((l) => [l.id, l.skuId])), [state.lots]);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId) ?? null;
  const selectedRoot = selected?.parentId ? state.units.find((u) => u.id === selected.parentId) ?? null : selected;
  // Traslado en ejecución: sus pallets ya no están en el rack (los lleva el montacargas al muelle de salida).
  const activeMove = state.movements.find((m) => m.status === 'IN_PROGRESS') ?? null;
  const plannedMove = state.movements.find((m) => m.status === 'PLANNED') ?? null;
  const transit = useMemo(() => {
    if (!activeMove) return new Set<string>();
    const ids = new Set(activeMove.unitIds);
    state.units.forEach((u) => { if (u.parentId && ids.has(u.parentId)) ids.add(u.id); });
    return ids;
  }, [activeMove, state.units]);
  const shownUnits = useMemo(() => (transit.size ? state.units.filter((u) => !transit.has(u.id)) : state.units), [state.units, transit]);
  const units = useMemo(() => layoutUnits(shownUnits, lotSku, locPos, selectedRoot?.id ?? null, hoveredId,
    (loc) => !isolatedRackId || locRack.get(loc) === isolatedRackId), [shownUnits, lotSku, locPos, selectedRoot?.id, hoveredId, isolatedRackId, locRack]);
  const alerting = unitsWithOpenAlerts(state);
  const isRisk = (u: LogisticUnit) => u.lotId !== null && expiryRiskLots.has(u.lotId);
  const width = zones.find((z) => z.zone.kind === 'RECEIVING')?.size[0] ?? 34;
  const po = state.purchaseOrders[0];
  const missing = po ? po.boxes.length - po.receivedBoxIds.length : 0;
  const dockPos = po ? locPos.get(po.dockLocationId) : undefined;
  const receiving = state.ui.playback === RECEIPT_SCENARIO_ID;
  const ambientOn = layers.decor && !reduced && !lowPower;

  // Operario: pasillo de la última lectura del lector de mano, a la altura de esa bahía.
  const lastHandheld = [...state.events].reverse().find((e) => e.channel === 'RFID_HANDHELD' && e.locationHintId);
  const operator = useMemo((): Vec3 | null => {
    if (!lastHandheld?.locationHintId) return null;
    const loc = state.locations.find((l) => l.id === lastHandheld.locationHintId);
    const rack = state.racks.find((r) => r.id === loc?.rackId);
    const aisle = aisles.find((a) => a.aisle === rack?.aisle);
    const p = locPos.get(lastHandheld.locationHintId);
    return aisle && p ? [aisle.x, 0, p[2]] : null;
  }, [lastHandheld?.id, aisles, locPos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unidades leídas en una ubicación distinta de la registrada (evidencia, no traslado confirmado).
  const ghosts = state.units.filter((u) => !u.parentId && u.observedLocationId && u.observedLocationId !== u.expectedLocationId);
  // Tooltip solo al pasar el cursor; la selección se describe en la tarjeta fuera del lienzo (menos ruido).
  const focused = hoveredId ? state.units.find((u) => u.id === hoveredId) ?? null : null;
  const focusedFoot = focused ? units.footprint.get(focused.id) : undefined;
  const selectedFoot = selectedRoot ? units.footprint.get(selectedRoot.id) : undefined;

  // Meta de cámara según la orden recibida (vista general, superior, paso del recorrido, unidad o rack).
  const pal = state.units.find((u) => u.id === 'PAL-001');
  const obsLoc = pal?.observedLocationId ?? null;
  const goal = useMemo(() => {
    if (!camCommand) return null;
    const add = (t: Vec3, o: Vec3): Vec3 => [t[0] + o[0], t[1] + o[1], t[2] + o[2]];
    const aisleX = (n: number) => aisles.find((a) => a.aisle === n)?.x ?? 0;
    const home = { key: camCommand.n, target: TARGET_HOME, pos: CAMERA_HOME };
    switch (camCommand.kind) {
      case 'home': return home;
      case 'top': return { key: camCommand.n, target: [0, 0, 0.6] as Vec3, pos: [0, 44, 1.2] as Vec3 };
      case 'unit': {
        const f = units.footprint.get(camCommand.unitId);
        if (!f) return null;
        const t: Vec3 = [f.p[0], f.p[1] + 0.5, f.p[2]];
        return { key: camCommand.n, target: t, pos: add(t, [-6.5, 7, 8.5]) };
      }
      case 'rack': {
        const r = racks.find((x) => x.rack.id === camCommand.rackId);
        if (!r) return null;
        const t: Vec3 = [r.position[0], 1.6, r.position[2]];
        const side = r.rack.side === 'I' ? 1 : -1; // mirar desde el pasillo
        return { key: camCommand.n, target: t, pos: add(t, [side * 8.5, 4.2, 5.5]) };
      }
      case 'step': {
        const exp = pal ? locPos.get(pal.expectedLocationId) : undefined;
        const obs = obsLoc ? locPos.get(obsLoc) : undefined;
        if (camCommand.step === 0) return home;
        if (camCommand.step === 1) { const t: Vec3 = [aisleX(4), 0.8, STORAGE_Z]; return { key: camCommand.n, target: t, pos: add(t, [-12, 13, 14]) }; }
        if (camCommand.step === 5) {
          const m = state.movements.find((x) => x.status !== 'COMPLETED') ?? state.movements.at(-1);
          const pts = (m?.originLocationIds ?? []).map((l) => locPos.get(l)).filter((x): x is Vec3 => !!x);
          if (pts.length) {
            const cx = (pts.reduce((t, q) => t + q[0], 0) / pts.length + D2_X) / 2;
            const t: Vec3 = [cx + 1, 0.6, (STORAGE_Z + FRONT_Z) / 2 + 0.5];
            return { key: camCommand.n, target: t, pos: add(t, [-9, 15.5, 14]) };
          }
        }
        if (camCommand.step === 2 && exp && obs) { const t: Vec3 = [(exp[0] + obs[0]) / 2, 0.8, STORAGE_Z]; return { key: camCommand.n, target: t, pos: add(t, [-13, 15, 16]) }; }
        const t: Vec3 = [aisleX(2), 0.8, STORAGE_Z];
        return { key: camCommand.n, target: t, pos: add(t, [-12, 13, 14]) };
      }
      default: return null;
    }
  }, [camCommand?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const legs = useMemo((): TransferLeg[] => {
    if (!activeMove) return [];
    return activeMove.unitIds.flatMap((id, i) => {
      const u = state.units.find((x) => x.id === id);
      const origin = locPos.get(activeMove.originLocationIds[i]);
      const rack = state.racks.find((r) => r.id === locRack.get(activeMove.originLocationIds[i]));
      const aisle = aisles.find((a) => a.aisle === rack?.aisle);
      if (!u || !origin || !aisle) return [];
      const boxes = state.units.filter((x) => x.parentId === id).length;
      return [{ unitId: id, boxes, color: familyColor(lotSku.get(u.lotId ?? '') ?? null), origin, aisleX: aisle.x,
        staging: [D2_X + (i % 2 === 0 ? -0.65 : 0.65), 0, FRONT_Z - 1.7] as Vec3 }];
    });
  }, [activeMove?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const destName = activeMove ? state.remoteSites.find((x) => x.warehouseId === activeMove.toWarehouseId)?.name.replace(' (simulada)', '') ?? '' : '';
  const plannedFeet = plannedMove ? plannedMove.unitIds.map((id) => units.footprint.get(id)).filter((f): f is { p: Vec3; h: number } => !!f) : [];
  const lastDone = [...state.movements].reverse().find((m) => m.status === 'COMPLETED');
  const isolatedLocs = useMemo(() => (isolatedRackId ? state.locations.filter((l) => l.rackId === isolatedRackId) : []), [isolatedRackId, state.locations]);

  return (
    <>
      <color attach="background" args={['#eef0f5']} />
      <fog attach="fog" args={['#eef0f5', 48, 95]} />
      <hemisphereLight args={['#ffffff', '#c9ced8', 0.75]} />
      <ambientLight intensity={0.3} />
      <directionalLight
        position={[-14, 26, 16]}
        intensity={1.35}
        castShadow={!lowPower}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-near={1}
        shadow-camera-far={80}
      />
      <directionalLight position={[16, 10, -10]} intensity={0.3} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0.8]} receiveShadow raycast={() => null}>
        <planeGeometry args={[width + 6, 32]} />
        <meshStandardMaterial color="#e6e8ee" roughness={0.95} />
      </mesh>
      {aisles.map((a) => (
        <mesh key={a.aisle} rotation={[-Math.PI / 2, 0, 0]} position={[a.x, 0.004, STORAGE_Z]} receiveShadow raycast={() => null}>
          <planeGeometry args={[AISLE_W - 0.35, RACK_LENGTH + 0.4]} />
          <meshStandardMaterial color="#dfe2e9" />
        </mesh>
      ))}

      <Building width={width} truck={po?.status !== 'CLOSED'} walls={layers.walls} decor={layers.decor} />
      {layers.signage && <Signage zones={zones} aisles={aisles} racks={allStorageRacks} width={width} />}
      <RfidPortal readCount={po?.readCount ?? 0} reading={receiving} />
      {receiving && po && (
        <IncomingPallet progress={po.receivedBoxIds.length / po.boxes.length} remaining={po.boxes.length - po.receivedBoxIds.length - 1} poId={po.id} />
      )}
      {/* Montacargas ambiental: solo por el pasillo trasero (no se cruza delante del inventario). */}
      {layers.decor && <Forklift lane={STORAGE_Z - RACK_LENGTH / 2 - 1.2} phase={1.2} speed={0.05} running={ambientOn} />}

      <Racks racks={storageRacks} mode={layers.racks} />
      {layers.inventory && (
        <>
          <InstancedBoxes items={units.pallets} color="#a8835a" ids={units.palletIds} onPick={onSelect} onHover={setHoveredId} onDouble={onFocusUnit} />
          <InstancedBoxes items={units.boxes} ids={units.boxIds} onPick={onSelect} onHover={setHoveredId} onDouble={onFocusUnit} />
        </>
      )}

      {/* Riesgo de vencimiento: franja roja sobre los pallets del lote. */}
      {state.units.filter((u) => u.type === 'PALLET' && isRisk(u)).map((u) => {
        const f = units.footprint.get(u.id);
        return f ? (
          <mesh key={`risk-${u.id}`} position={[f.p[0], f.p[1] + f.h + 0.04, f.p[2]]} raycast={() => null}>
            <boxGeometry args={[1.0, 0.05, 1.22]} /><meshStandardMaterial color="#ef4444" />
          </mesh>
        ) : null;
      })}

      {po && po.status === 'CLOSED' && missing > 0 && dockPos && (
        <group position={[dockPos[0] + 0.25, dockPos[1] + 0.29 + 2 * 0.35, dockPos[2] + 0.29]}>
          <mesh raycast={() => null}><boxGeometry args={[0.5, 0.36, 0.58]} /><meshBasicMaterial color={EVENT_COLOR.pending} wireframe /></mesh>
          {layers.labels && <Html position={[0, 0.9, 0]} center pointerEvents="none" zIndexRange={[15, 5]}>
            <div className="label3d-missing">Falta {missing} caja{missing > 1 ? 's' : ''} · {po.id}</div>
          </Html>}
        </group>
      )}

      {selectedFoot && <SelectionHighlight foot={selectedFoot} />}
      {plannedFeet.length > 0 && <PlannedHighlight feet={plannedFeet} />}
      {activeMove && legs.length > 0 && (
        <TransferRun key={activeMove.id} legs={legs} reduced={reduced} label={layers.labels ? `${activeMove.quantity} u → ${destName}` : null} />
      )}
      {lastDone && !activeMove && layers.labels && (
        <Html position={[D2_X, 1.6, FRONT_Z - 1.7]} center pointerEvents="none" zIndexRange={[15, 5]}>
          <div className="label3d-done" data-testid="transfer-done-label">Recibido en {state.remoteSites.find((x) => x.warehouseId === lastDone.toWarehouseId)?.name.replace(' (simulada)', '')} · {lastDone.receivedQuantity} u</div>
        </Html>
      )}

      {ghosts.map((u) => {
        const obs = locPos.get(u.observedLocationId!);
        const exp = locPos.get(u.expectedLocationId);
        if (!obs || !exp) return null;
        const y = RACK_HEIGHT + 0.5;
        return (
          <group key={`ghost-${u.id}`}>
            <mesh position={[exp[0], exp[1] + 0.5, exp[2]]} raycast={() => null}>
              <boxGeometry args={[1.2, 1.0, 1.4]} />
              <meshBasicMaterial color="#3b82f6" wireframe />
            </mesh>
            <ObservationGhost position={obs} unitId={u.id} locationId={u.observedLocationId!} label={layers.labels} />
            <Line
              points={[[exp[0], exp[1] + 1.0, exp[2]], [exp[0], y, exp[2]], [obs[0], y, obs[2]], [obs[0], obs[1] + 1.0, obs[2]]]}
              color={EVENT_COLOR.pending}
              lineWidth={2.5}
              dashed
              dashSize={0.35}
              gapSize={0.2}
            />
          </group>
        );
      })}

      {focused && focusedFoot && (
        <UnitTooltip state={state} unit={focused} position={focusedFoot.p} pending={alerting.has(focused.id)} />
      )}
      {operator && lastHandheld && !receiving && (state.ui.playback === COUNT_SCENARIO_ID || state.events.some((e) => e.id === 'evt-demo-001')) && (
        <HandheldOperator target={operator} readKey={lastHandheld.id} label={layers.labels} />
      )}

      {/* Placas de ubicación pegadas al larguero, del lado del pasillo (sin etiquetas flotantes). */}
      {layers.labels && isolatedLocs.map((l) => {
        const p = locPos.get(l.id);
        const side = state.racks.find((r) => r.id === l.rackId)?.side === 'I' ? 1 : -1;
        return p ? (
          <TextPlane key={l.id} text={l.id} position={[p[0] + side * (RACK_DEPTH / 2 + 0.06), p[1] + 0.02, p[2]]} height={0.15}
            color="#17142f" bg="#ffffff" rotation={[0, side * Math.PI / 2, 0]} weight={700} />
        ) : null;
      })}

      <OrbitControls makeDefault enableDamping target={TARGET_HOME} minDistance={3.5} maxDistance={60} minPolarAngle={0} maxPolarAngle={1.35} />
      <CameraRig goal={goal} zoom={zoomRequest} />
      <ProjectionHook footprint={units.footprint} />
      <PerformanceMonitor onDecline={() => setLowPower(true)} />
      <AdaptiveDpr pixelated />
    </>
  );
}

export default function WarehouseScene(props: SceneProps) {
  return (
    <Canvas
      shadows="percentage"
      camera={{ position: CAMERA_HOME, fov: 36 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      data-testid="warehouse-canvas"
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
