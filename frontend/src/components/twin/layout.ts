// Disposición espacial de la bodega de demo, derivada de zonas/racks/ubicaciones del estado.
// Las coordenadas son de REPRESENTACIÓN (asignadas por el sistema), no posiciones medidas.
// Todos los racks quedan en una sola fila (eje X) para que, vistos de frente, ninguno tape a otro.
import type { Location, Rack, Zone } from '../../domain/types';

export const LEVEL_HEIGHT = 1.35;
export const RACK_WIDTH = 2.4;
export const RACK_DEPTH = 1.4;
/** Separación entre centros de racks de una misma zona. */
export const RACK_SPACING_X = 2.9;
/** Separación entre centros de zonas. */
export const ZONE_SPACING = 7.4;
export const ZONE_DEPTH = 4.6;

export type Vec3 = [number, number, number];

export interface RackLayout { rack: Rack; position: Vec3 }
export interface ZoneLayout { zone: Zone; center: Vec3; size: [number, number] }

export function zoneLayouts(zones: Zone[]): ZoneLayout[] {
  return zones.map((zone, i) => ({
    zone,
    center: [(i - (zones.length - 1) / 2) * ZONE_SPACING, 0, 0],
    size: [ZONE_SPACING - 0.6, ZONE_DEPTH],
  }));
}

export function rackLayouts(zones: Zone[], racks: Rack[]): RackLayout[] {
  const zl = new Map(zoneLayouts(zones).map((z) => [z.zone.id, z]));
  return racks.map((rack) => {
    const zone = zl.get(rack.zoneId)!;
    const inZone = racks.filter((r) => r.zoneId === rack.zoneId);
    const idx = inZone.indexOf(rack);
    const x = zone.center[0] + (idx - (inZone.length - 1) / 2) * RACK_SPACING_X;
    return { rack, position: [x, 0, 0] };
  });
}

/** Centro superior de la balda donde se apoya una unidad en la ubicación indicada. */
export function locationPositions(zones: Zone[], racks: Rack[], locations: Location[]): Map<string, Vec3> {
  const rl = new Map(rackLayouts(zones, racks).map((r) => [r.rack.id, r]));
  const out = new Map<string, Vec3>();
  for (const loc of locations) {
    const rack = rl.get(loc.rackId);
    if (!rack) continue;
    out.set(loc.id, [rack.position[0], (loc.level - 1) * LEVEL_HEIGHT + 0.12, rack.position[2]]);
  }
  return out;
}
