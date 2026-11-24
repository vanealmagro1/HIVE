import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../store/demoState';
import { rackOfUnit, searchInventory } from './search';

describe('búsqueda en el gemelo', () => {
  const s = createInitialState();
  it('por nombre de producto devuelve todas las ubicaciones (sin tildes ni mayúsculas)', () => {
    const r = searchInventory(s, 'mochila escolar basica');
    expect(r.map((h) => h.unitId).sort()).toEqual(['PAL-001', 'PAL-002', 'PAL-003', 'PAL-004']);
    expect(r.every((h) => h.title === 'Mochila escolar básica' && h.matchedBy === 'producto')).toBe(true);
  });
  it('por SKU, pallet, caja y ubicación', () => {
    expect(searchInventory(s, 'MOC-001')).toHaveLength(4);
    expect(searchInventory(s, 'PAL-001')[0]).toMatchObject({ unitId: 'PAL-001', matchedBy: 'pallet' });
    expect(searchInventory(s, 'BOX-001-3')[0]).toMatchObject({ unitId: 'PAL-001', matchedBy: 'caja' });
    expect(searchInventory(s, 'B-03-01')[0]).toMatchObject({ unitId: 'PAL-001', matchedBy: 'ubicación' });
  });
  it('encuentra productos dentro de pallets mixtos', () => {
    const mixed = s.units.find((u) => u.type === 'PALLET' && u.lotId === null)!;
    const sku = s.lots.find((l) => l.id === s.units.find((u) => u.parentId === mixed.id)!.lotId)!.skuId;
    expect(searchInventory(s, sku).some((h) => h.unitId === mixed.id && h.title === 'Pallet mixto')).toBe(true);
  });
  it('consultas cortas no devuelven nada; el rack de una unidad se resuelve', () => {
    expect(searchInventory(s, 'a')).toEqual([]);
    expect(rackOfUnit(s, 'PAL-001')).toBe('R-P2I');
    expect(rackOfUnit(s, 'BOX-001-1')).toBe('R-P2I');
  });
});
