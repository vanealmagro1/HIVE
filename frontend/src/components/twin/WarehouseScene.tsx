// Gemelo digital 3D. Todo lo que se dibuja deriva del estado único (props `state`).
// No usa recursos externos (sin fuentes, HDRI ni modelos remotos) para funcionar sin internet.
//
// Criterio de legibilidad: los textos van PEGADOS a los objetos (cara frontal del pallet, letrero del rack,
// rótulo pintado en el piso de la zona) en lugar de flotar sobre la escena. Solo hay UNA ficha flotante:
// la del pallet bajo el cursor o, si no hay ninguno, la del pallet seleccionado.
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { LogisticUnit, VerificationStatus } from '../../domain/types';
import type { DemoState } from '../../store/demoState';
import { STATUS_ICON, STATUS_LABEL, skuOfUnit, unitsWithOpenAlerts } from '../../store/selectors';
import {
  LEVEL_HEIGHT, RACK_DEPTH, RACK_WIDTH, ZONE_DEPTH, locationPositions, rackLayouts, zoneLayouts, type Vec3,
} from './layout';

export const STATUS_COLOR: Record<VerificationStatus, string> = {
  EXPECTED: '#8aa1b8',
  OBSERVED: '#3fa56b',
  PENDING_VERIFICATION: '#e09a1a',
  CONFIRMED: '#2f7fd1',
};

const CAMERA_HOME: Vec3 = [0, 6.9, 16.6];
const TARGET_HOME: Vec3 = [0, 2.6, 0];
const RACK_HEIGHT = LEVEL_HEIGHT * 3;
/** Escala de las etiquetas pegadas a objetos: 80 px CSS = 1 unidad de mundo. */
const FACE_DF = 5;

interface SceneProps {
  state: DemoState;
  expiryRiskLots: Set<string>;
  onSelect: (unitId: string) => void;
  /** Se incrementa para volver al encuadre general. */
  resetViewRequest: number;
}

function Rack3D({ position, name }: { position: Vec3; name: string }) {
  const posts: Vec3[] = [
    [-RACK_WIDTH / 2, RACK_HEIGHT / 2, -RACK_DEPTH / 2], [RACK_WIDTH / 2, RACK_HEIGHT / 2, -RACK_DEPTH / 2],
    [-RACK_WIDTH / 2, RACK_HEIGHT / 2, RACK_DEPTH / 2], [RACK_WIDTH / 2, RACK_HEIGHT / 2, RACK_DEPTH / 2],
  ];
  return (
    <group position={position}>
      {posts.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.08, RACK_HEIGHT, 0.08]} />
          <meshStandardMaterial color="#3b6ea8" />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((lvl) => (
        <mesh key={lvl} position={[0, lvl * LEVEL_HEIGHT + 0.04, 0]}>
          <boxGeometry args={[RACK_WIDTH, 0.06, RACK_DEPTH]} />
          <meshStandardMaterial color={lvl === 0 ? '#5b6573' : '#d08a2c'} />
        </mesh>
      ))}
      {/* Letrero del rack, pegado al travesaño superior. */}
      <mesh position={[0, RACK_HEIGHT + 0.32, RACK_DEPTH / 2]}>
        <boxGeometry args={[1.3, 0.42, 0.04]} />
        <meshStandardMaterial color="#1f4f86" />
      </mesh>
      <Html transform distanceFactor={FACE_DF} pointerEvents="none" position={[0, RACK_HEIGHT + 0.32, RACK_DEPTH / 2 + 0.03]} style={{ pointerEvents: 'none' }}>
        <div className="face-label face-rack">{name}</div>
      </Html>
    </group>
  );
}

function Pallet3D({
  unit, position, selected, alert, expiryRisk, boxes, onSelect, onHover,
}: {
  unit: LogisticUnit; position: Vec3; selected: boolean; alert: boolean; expiryRisk: boolean; boxes: LogisticUnit[];
  onSelect: (id: string) => void; onHover: (id: string | null) => void;
}) {
  const color = STATUS_COLOR[unit.verificationStatus];
  const emissive = selected ? '#ffffff' : '#000000';
  return (
    <group
      position={position}
      onClick={(e) => { e.stopPropagation(); onSelect(unit.id); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(unit.id); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
      name={unit.id}
    >
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[1.8, 0.14, 1.15]} />
        <meshStandardMaterial color="#9c7a4f" emissive={emissive} emissiveIntensity={selected ? 0.25 : 0} />
      </mesh>
      {boxes.map((b, i) => (
        <mesh key={b.id} position={[(i - (boxes.length - 1) / 2) * 0.86, 0.55, 0]}>
          <boxGeometry args={[0.8, 0.78, 1.05]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={selected ? 0.3 : 0} />
        </mesh>
      ))}
      {expiryRisk && (
        <mesh position={[0, 0.98, 0]}>
          <boxGeometry args={[1.74, 0.08, 1.07]} />
          <meshStandardMaterial color="#c0392b" />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2.0, 1.15, 1.35]} />
          <meshBasicMaterial color="#ffffff" wireframe />
        </mesh>
      )}
      {/* ID impreso en la cara frontal del pallet. */}
      <Html transform distanceFactor={FACE_DF} pointerEvents="none" position={[0, 0.55, 0.54]} style={{ pointerEvents: 'none' }}>
        <div className={`face-label label3d-unit${selected ? ' is-selected' : ''}${alert ? ' is-alert' : ''}`}>
          {alert ? '⚠ ' : ''}{unit.id}{expiryRisk ? ' ⏳' : ''}
        </div>
      </Html>
    </group>
  );
}

function ObservationGhost({ position, unitId, locationId }: { position: Vec3; unitId: string; locationId: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.8, 0.95, 1.15]} />
        <meshStandardMaterial color="#e09a1a" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.82, 0.97, 1.17]} />
        <meshBasicMaterial color="#e09a1a" wireframe />
      </mesh>
      <Html transform distanceFactor={FACE_DF} pointerEvents="none" position={[0, 0.5, 0.6]} style={{ pointerEvents: 'none' }}>
        <div className="face-label label3d-ghost">
          ◇ Observación de {unitId}<br /><small>evidencia simulada · {locationId}</small>
        </div>
      </Html>
    </group>
  );
}

function ExpectedMarker({ position }: { position: Vec3 }) {
  return (
    <mesh position={[position[0], position[1] + 0.5, position[2]]}>
      <boxGeometry args={[2.15, 1.2, 1.4]} />
      <meshBasicMaterial color="#2f7fd1" wireframe />
    </mesh>
  );
}

/** Texto pintado en el piso (textura de canvas: forma parte de la escena, sin DOM ni fuentes externas). */
function FloorText({ text, position }: { text: string; position: Vec3 }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '900 84px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(240, 180, 41, 0.95)';
      ctx.fillText(text, 256, 68);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.anisotropy = 4;
    return t;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position} raycast={() => null}>
      <planeGeometry args={[2.8, 0.7]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/** Ficha flotante única, sobre el rack del pallet enfocado (no tapa otros pallets). */
function UnitCallout({ state, unit, position, alert, expiryRisk }: {
  state: DemoState; unit: LogisticUnit; position: Vec3; alert: boolean; expiryRisk: boolean;
}) {
  const sku = skuOfUnit(state, unit);
  const qty = state.units.filter((b) => b.parentId === unit.id).reduce((s, b) => s + b.quantityBaseUnits, 0);
  const observedElsewhere = unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId;
  return (
    <Html position={[position[0], RACK_HEIGHT + 1.45, position[2]]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 10]}>
      <div className={`callout${alert ? ' is-alert' : ''}`} data-testid="unit-callout">
        <div className="callout-title">{unit.id} · {sku?.id ?? '—'} · {qty} u</div>
        <div>Esperado: <strong>{unit.expectedLocationId}</strong>
          {observedElsewhere && <> · Observado: <strong>{unit.observedLocationId}</strong></>}
        </div>
        <div>{STATUS_ICON[unit.verificationStatus]} {STATUS_LABEL[unit.verificationStatus]}</div>
        {expiryRisk && <div>⏳ Lote con riesgo de vencimiento</div>}
      </div>
    </Html>
  );
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
  const locPos = useMemo(() => locationPositions(state.zones, state.racks, state.locations), [state.zones, state.racks, state.locations]);
  const alerting = unitsWithOpenAlerts(state);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId) ?? null;
  const selectedPallet = selected?.type === 'BOX' ? state.units.find((u) => u.id === selected.parentId) ?? null : selected;
  const palletList = state.units.filter((u) => u.type === 'PALLET');
  const isRisk = (u: LogisticUnit) => u.lotId !== null && expiryRiskLots.has(u.lotId);

  // Unidades con observación en una ubicación distinta de la esperada (evidencia, no traslado confirmado).
  const ghosts = palletList.filter((u) => u.observedLocationId && u.observedLocationId !== u.expectedLocationId);
  const focused = palletList.find((u) => u.id === hoveredId) ?? selectedPallet;
  const focusedPos = focused ? locPos.get(focused.expectedLocationId) : undefined;

  return (
    <>
      <color attach="background" args={['#1b2330']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[10, 18, 8]} intensity={1.3} />
      <directionalLight position={[-12, 10, -6]} intensity={0.35} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[30, 9]} />
        <meshStandardMaterial color="#39424f" />
      </mesh>
      {zones.map(({ zone, center, size }) => (
        <group key={zone.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0.005, center[2]]}>
            <planeGeometry args={size} />
            <meshStandardMaterial color="#465262" />
          </mesh>
          {/* Rótulo pintado en el piso, delante de los racks. */}
          <FloorText text={zone.name.toUpperCase()} position={[center[0], 0.02, ZONE_DEPTH / 2 - 0.6]} />
        </group>
      ))}

      {racks.map(({ rack, position }) => <Rack3D key={rack.id} position={position} name={rack.name} />)}

      {palletList.map((u) => {
        const pos = locPos.get(u.expectedLocationId);
        if (!pos) return null;
        return (
          <Pallet3D
            key={u.id}
            unit={u}
            position={pos}
            selected={selectedPallet?.id === u.id}
            alert={alerting.has(u.id)}
            expiryRisk={isRisk(u)}
            boxes={state.units.filter((b) => b.parentId === u.id)}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        );
      })}

      {ghosts.map((u) => {
        const obs = locPos.get(u.observedLocationId!);
        const exp = locPos.get(u.expectedLocationId);
        if (!obs || !exp) return null;
        const y = RACK_HEIGHT + 0.6;
        return (
          <group key={`ghost-${u.id}`}>
            <ExpectedMarker position={exp} />
            <ObservationGhost position={obs} unitId={u.id} locationId={u.observedLocationId!} />
            <Line
              points={[[exp[0], exp[1] + 1.1, exp[2] + 0.8], [exp[0], y, exp[2] + 0.8], [obs[0], y, obs[2] + 0.8], [obs[0], obs[1] + 1.1, obs[2] + 0.8]]}
              color="#e09a1a"
              lineWidth={2}
              dashed
              dashSize={0.3}
              gapSize={0.2}
            />
          </group>
        );
      })}

      {focused && focusedPos && (
        <UnitCallout state={state} unit={focused} position={focusedPos} alert={alerting.has(focused.id)} expiryRisk={isRisk(focused)} />
      )}

      <OrbitControls
        makeDefault
        enableDamping
        target={TARGET_HOME}
        minDistance={6}
        maxDistance={30}
        minPolarAngle={0.35}
        maxPolarAngle={1.4}
        minAzimuthAngle={-0.9}
        maxAzimuthAngle={0.9}
      />
      <CameraReset request={resetViewRequest} />
    </>
  );
}

export default function WarehouseScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: CAMERA_HOME, fov: 45 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'default' }}
      data-testid="warehouse-canvas"
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
