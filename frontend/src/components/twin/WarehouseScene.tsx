// Gemelo digital 3D. Todo lo que se dibuja deriva del estado único (props `state`).
// No usa recursos externos (sin fuentes, HDRI ni modelos remotos) para funcionar sin internet.
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { LogisticUnit, VerificationStatus } from '../../domain/types';
import type { DemoState } from '../../store/demoState';
import { STATUS_ICON, STATUS_LABEL, unitsWithOpenAlerts } from '../../store/selectors';
import {
  LEVEL_HEIGHT, RACK_DEPTH, RACK_WIDTH, locationPositions, rackLayouts, zoneLayouts, type Vec3,
} from './layout';

export const STATUS_COLOR: Record<VerificationStatus, string> = {
  EXPECTED: '#8aa1b8',
  OBSERVED: '#3fa56b',
  PENDING_VERIFICATION: '#e09a1a',
  CONFIRMED: '#2f7fd1',
};

interface SceneProps {
  state: DemoState;
  expiryRiskLots: Set<string>;
  onSelect: (unitId: string) => void;
  /** true = encuadre general de la bodega; false = foco en la unidad seleccionada. */
  overview: boolean;
  /** Se incrementa para volver a aplicar el encuadre aunque no cambie la selección. */
  focusRequest: number;
}

function Rack3D({ position, name }: { position: Vec3; name: string }) {
  const height = LEVEL_HEIGHT * 3;
  const posts: Vec3[] = [
    [-RACK_WIDTH / 2, height / 2, -RACK_DEPTH / 2], [RACK_WIDTH / 2, height / 2, -RACK_DEPTH / 2],
    [-RACK_WIDTH / 2, height / 2, RACK_DEPTH / 2], [RACK_WIDTH / 2, height / 2, RACK_DEPTH / 2],
  ];
  return (
    <group position={position}>
      {posts.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[0.08, height, 0.08]} />
          <meshStandardMaterial color="#3b6ea8" />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((lvl) => (
        <mesh key={lvl} position={[0, lvl * LEVEL_HEIGHT + 0.04, 0]}>
          <boxGeometry args={[RACK_WIDTH, 0.06, RACK_DEPTH]} />
          <meshStandardMaterial color={lvl === 0 ? '#5b6573' : '#d08a2c'} />
        </mesh>
      ))}
      <Html position={[0, height + 0.35, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="label3d label3d-rack">{name}</div>
      </Html>
    </group>
  );
}

function Pallet3D({
  unit, position, selected, alert, expiryRisk, onSelect, boxes,
}: {
  unit: LogisticUnit; position: Vec3; selected: boolean; alert: boolean; expiryRisk: boolean;
  onSelect: (id: string) => void; boxes: LogisticUnit[];
}) {
  const color = STATUS_COLOR[unit.verificationStatus];
  const emissive = selected ? '#ffffff' : '#000000';
  return (
    <group
      position={position}
      onClick={(e) => { e.stopPropagation(); onSelect(unit.id); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'auto'; }}
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
      <Html position={[0, 1.3, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`label3d label3d-unit${selected ? ' is-selected' : ''}${alert ? ' is-alert' : ''}`}>
          {STATUS_ICON[unit.verificationStatus]} {unit.id}
          {alert && <span> · {STATUS_LABEL[unit.verificationStatus]}</span>}
          {expiryRisk && <span> · ⏳ riesgo venc.</span>}
        </div>
      </Html>
    </group>
  );
}

function ObservationGhost({ position, unitId }: { position: Vec3; unitId: string }) {
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
      <Html position={[0, 1.3, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="label3d label3d-ghost">◇ Observación de {unitId} (evidencia simulada)</div>
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

function CameraFocus({ target, request }: { target: Vec3 | null; request: number }) {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update(): void } | null;
  const goal = useRef(new THREE.Vector3());
  const animating = useRef(false);

  useEffect(() => {
    goal.current.set(...(target ?? [0, 1.2, 0]));
    animating.current = true;
  }, [target?.[0], target?.[1], target?.[2], request]);

  useFrame(() => {
    if (!controls || !animating.current) return;
    controls.target.lerp(goal.current, 0.12);
    controls.update();
    if (controls.target.distanceTo(goal.current) < 0.01) animating.current = false;
  });
  return null;
}

function SceneContent({ state, expiryRiskLots, onSelect, overview, focusRequest }: SceneProps) {
  const zones = useMemo(() => zoneLayouts(state.zones), [state.zones]);
  const racks = useMemo(() => rackLayouts(state.zones, state.racks), [state.zones, state.racks]);
  const locPos = useMemo(() => locationPositions(state.zones, state.racks, state.locations), [state.zones, state.racks, state.locations]);
  const alerting = unitsWithOpenAlerts(state);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId) ?? null;
  const selectedPallet = selected?.type === 'BOX' ? state.units.find((u) => u.id === selected.parentId) ?? null : selected;
  const palletList = state.units.filter((u) => u.type === 'PALLET');

  // Unidades con observación en una ubicación distinta de la esperada (evidencia, no traslado confirmado).
  const ghosts = palletList.filter((u) => u.observedLocationId && u.observedLocationId !== u.expectedLocationId);
  const focusTarget = selectedPallet ? locPos.get(selectedPallet.expectedLocationId) ?? null : null;

  return (
    <>
      <color attach="background" args={['#1b2330']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[10, 18, 8]} intensity={1.3} />
      <directionalLight position={[-12, 10, -6]} intensity={0.35} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[34, 16]} />
        <meshStandardMaterial color="#39424f" />
      </mesh>
      {zones.map(({ zone, center, size }) => (
        <group key={zone.id}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0.005, center[2]]}>
            <planeGeometry args={size} />
            <meshStandardMaterial color="#465262" />
          </mesh>
          <Html position={[center[0], 0.05, center[2] + size[1] / 2 - 0.4]} center style={{ pointerEvents: 'none' }}>
            <div className="label3d label3d-zone">{zone.name}</div>
          </Html>
        </group>
      ))}

      {racks.map(({ rack, position }) => <Rack3D key={rack.id} position={position} name={rack.name} />)}

      {state.locations.map((loc) => {
        const p = locPos.get(loc.id)!;
        return (
          <Html key={loc.id} position={[p[0] - RACK_WIDTH / 2 - 0.55, p[1] + 0.35, p[2] + RACK_DEPTH / 2]} center style={{ pointerEvents: 'none' }}>
            <div className="label3d label3d-loc">{loc.id}</div>
          </Html>
        );
      })}

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
            expiryRisk={u.lotId !== null && expiryRiskLots.has(u.lotId)}
            onSelect={onSelect}
            boxes={state.units.filter((b) => b.parentId === u.id)}
          />
        );
      })}

      {ghosts.map((u) => {
        const obs = locPos.get(u.observedLocationId!);
        const exp = locPos.get(u.expectedLocationId);
        if (!obs || !exp) return null;
        return (
          <group key={`ghost-${u.id}`}>
            <ExpectedMarker position={exp} />
            <ObservationGhost position={obs} unitId={u.id} />
            <Line
              points={[[exp[0], exp[1] + 1.1, exp[2]], [exp[0], 5, exp[2]], [obs[0], 5, obs[2]], [obs[0], obs[1] + 1.1, obs[2]]]}
              color="#e09a1a"
              lineWidth={2}
              dashed
              dashSize={0.3}
              gapSize={0.2}
            />
          </group>
        );
      })}

      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.15} minDistance={5} maxDistance={40} target={[0, 1.2, 0]} />
      <CameraFocus target={overview ? null : focusTarget} request={focusRequest} />
    </>
  );
}

export default function WarehouseScene(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 13, 16.5], fov: 48 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'default' }}
      data-testid="warehouse-canvas"
    >
      <SceneContent {...props} />
    </Canvas>
  );
}
