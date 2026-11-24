// Búsqueda de inventario para el gemelo: producto, SKU, pallet, caja o ubicación.
// Cada resultado apunta a la unidad logística raíz (pallet o caja suelta) que se ve en el gemelo.
import type { DemoState } from '../../store/demoState';
import { unitContents } from '../../store/selectors';

export type MatchKind = 'producto' | 'SKU' | 'pallet' | 'caja' | 'ubicación';

export interface SearchHit {
  unitId: string;
  title: string;
  subtitle: string;
  locationId: string;
  matchedBy: MatchKind;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Coincidencias ordenadas: identificadores exactos primero, luego productos. Máximo `limit`. */
export function searchInventory(state: Pick<DemoState, 'units' | 'lots' | 'skus'>, query: string, limit = 60): SearchHit[] {
  const q = norm(query.trim());
  if (q.length < 2) return [];
  const roots = state.units.filter((u) => !u.parentId);
  const kids = new Map<string, string[]>();
  for (const u of state.units) if (u.parentId) kids.set(u.parentId, [...(kids.get(u.parentId) ?? []), u.id]);
  const hits: (SearchHit & { rank: number })[] = [];
  for (const root of roots) {
    const c = unitContents(state, root);
    let matchedBy: MatchKind | null = null;
    let rank = 9;
    if (norm(root.id) === q || norm(root.id).includes(q)) { matchedBy = root.type === 'PALLET' ? 'pallet' : 'caja'; rank = norm(root.id) === q ? 0 : 2; }
    else if ((kids.get(root.id) ?? []).some((k) => norm(k).includes(q))) { matchedBy = 'caja'; rank = 2; }
    else if (norm(root.expectedLocationId).includes(q)) { matchedBy = 'ubicación'; rank = 1; }
    else if (c.lines.some((l) => norm(l.skuId).includes(q))) { matchedBy = 'SKU'; rank = 3; }
    else if (c.lines.some((l) => norm(l.name).includes(q))) { matchedBy = 'producto'; rank = 4; }
    if (matchedBy) hits.push({ unitId: root.id, title: c.title, subtitle: c.subtitle, locationId: root.expectedLocationId, matchedBy, rank });
  }
  return hits
    .sort((a, b) => a.rank - b.rank || a.locationId.localeCompare(b.locationId))
    .slice(0, limit)
    .map(({ rank: _r, ...h }) => h);
}

/** Rack que contiene la ubicación registrada de una unidad. */
export function rackOfUnit(state: Pick<DemoState, 'units' | 'locations'>, unitId: string): string | null {
  const u = state.units.find((x) => x.id === unitId);
  const root = u?.parentId ? state.units.find((x) => x.id === u.parentId) : u;
  const loc = state.locations.find((l) => l.id === root?.expectedLocationId);
  return loc?.rackId ?? null;
}
