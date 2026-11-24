// Disposición espacial de la bodega, derivada de zonas/racks/ubicaciones del estado.
// Las coordenadas son de REPRESENTACIÓN (asignadas por el sistema), no posiciones medidas.
//
//   Vista desde el andén (z+) hacia el fondo (z−):
//   ┌──────── Zona A ────────┬──────── Zona B ────────┬──────── Zona C ────────┐
//   │ [I] P1 [D]  [I] P2 [D] │ [I] P3 [D]  [I] P4 [D] │ [I] P5 [D]  [I] P6 [D] │  racks paralelos al eje Z:
//   │      pasillo   pasillo │                        │                        │  los pasillos se ven de frente
//   └────────────────────────┴────────────────────────┴────────────────────────┘
//   ═════════ Andén de recepción: posiciones REC-01…04 · portal RFID · camión ═════════
import type { Location, Rack, Zone } from '../../domain/types';

export const LEVEL_HEIGHT = 1.15;
export const LEVELS = 3;
export const BAYS = 5;
export const BAY_W = 1.4; // a lo largo del rack (eje Z)
export const RACK_DEPTH = 1.1; // profundidad del rack (eje X)
export const AISLE_W = 2.3; // ancho libre entre frentes de rack
export const AISLE_PITCH = AISLE_W + 2 * RACK_DEPTH + 0.6;
export const ZONE_SPACING = 11.4;
export const STORAGE_Z = -2; // centro de los racks en Z
export const RACK_LENGTH = BAYS * BAY_W;
export const RACK_HEIGHT = LEVELS * LEVEL_HEIGHT;
export const DOCK_Z = 5.4; // centro de las posiciones de recepción
export const PORTAL_Z = 7.8; // portal RFID (puerta del andén)
export const FRONT_Z = 8.6; // borde del edificio

export type Vec3 = [number, number, number];

export interface RackLayout { rack: Rack; position: Vec3; storage: boolean }
export interface ZoneLayout { zone: Zone; center: Vec3; size: [number, number] }
export interface AisleLayout { aisle: number; zoneId: string; x: number }

const storageZones = (zones: Zone[]) => zones.filter((z) => z.kind !== 'RECEIVING');

function zoneX(zones: Zone[], zoneId: string): number {
  const list = storageZones(zones);
  const i = list.findIndex((z) => z.id === zoneId);
  return (i - (list.length - 1) / 2) * ZONE_SPACING;
}

export function aisleLayouts(zones: Zone[], racks: Rack[]): AisleLayout[] {
  const out = new Map<number, AisleLayout>();
  for (const r of racks) {
    if (!r.aisle || out.has(r.aisle)) continue;
    const inZone = [...new Set(racks.filter((x) => x.zoneId === r.zoneId && x.aisle).map((x) => x.aisle!))].sort((a, b) => a - b);
    const k = inZone.indexOf(r.aisle);
    out.set(r.aisle, { aisle: r.aisle, zoneId: r.zoneId, x: zoneX(zones, r.zoneId) + (k - (inZone.length - 1) / 2) * AISLE_PITCH });
  }
  return [...out.values()].sort((a, b) => a.aisle - b.aisle);
}

export function zoneLayouts(zones: Zone[]): ZoneLayout[] {
  const storage = storageZones(zones);
  const width = storage.length * ZONE_SPACING;
  return zones.map((zone) => (zone.kind === 'RECEIVING'
    ? { zone, center: [0, 0, (DOCK_Z + FRONT_Z) / 2 - 0.9] as Vec3, size: [width - 0.6, FRONT_Z - DOCK_Z + 3.2] as [number, number] }
    : { zone, center: [zoneX(zones, zone.id), 0, STORAGE_Z + 0.6] as Vec3, size: [ZONE_SPACING - 0.6, RACK_LENGTH + 2.6] as [number, number] }));
}

export function rackLayouts(zones: Zone[], racks: Rack[]): RackLayout[] {
  const aisles = new Map(aisleLayouts(zones, racks).map((a) => [a.aisle, a]));
  return racks.map((rack) => {
    const a = rack.aisle ? aisles.get(rack.aisle) : undefined;
    if (!a) return { rack, position: [0, 0, DOCK_Z] as Vec3, storage: false };
    const offset = AISLE_W / 2 + RACK_DEPTH / 2;
    return { rack, position: [a.x + (rack.side === 'I' ? -offset : offset), 0, STORAGE_Z] as Vec3, storage: true };
  });
}

/** Centro de la base donde se apoya una unidad en la ubicación indicada. */
export function locationPositions(zones: Zone[], racks: Rack[], locations: Location[]): Map<string, Vec3> {
  const rl = new Map(rackLayouts(zones, racks).map((r) => [r.rack.id, r]));
  const out = new Map<string, Vec3>();
  for (const loc of locations) {
    const r = rl.get(loc.rackId);
    if (!r) continue;
    if (!r.storage) {
      out.set(loc.id, [(loc.slot - 2.5) * 3, 0.02, DOCK_Z]);
      continue;
    }
    const z = STORAGE_Z + (loc.slot - (BAYS + 1) / 2) * BAY_W;
    out.set(loc.id, [r.position[0], (loc.level - 1) * LEVEL_HEIGHT + 0.06, z]);
  }
  return out;
}
