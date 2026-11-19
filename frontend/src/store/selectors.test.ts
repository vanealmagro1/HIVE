import { describe, expect, it } from 'vitest';
import { createInitialState, inventoryTotals } from './demoState';
import { unitContents } from './selectors';
import { hierarchyIssues } from '../domain/inventory';

describe('identificación producto → SKU → pallet', () => {
  const s = createInitialState();

  it('pallet de un solo producto: el nombre comercial va primero y el pallet queda como referencia', () => {
    const c = unitContents(s, s.units.find((u) => u.id === 'PAL-001')!);
    expect(c).toMatchObject({ kind: 'single', title: 'Mochila escolar básica', skuId: 'MOC-001', qty: 150, subtitle: 'MOC-001 · 150 unidades' });
  });

  it('pallets mixtos: varias líneas de SKU, sin atribuir un único producto, cantidades = suma de cajas', () => {
    const mixed = s.units.filter((u) => u.type === 'PALLET' && u.lotId === null);
    expect(mixed.length).toBeGreaterThanOrEqual(4);
    for (const p of mixed) {
      const c = unitContents(s, p);
      expect(c.kind).toBe('mixed');
      expect(c.title).toBe('Pallet mixto');
      expect(c.skuId).toBeNull();
      expect(c.lines.length).toBeGreaterThanOrEqual(2);
      expect(c.qty).toBe(p.quantityBaseUnits);
      expect(c.subtitle).toMatch(/^\d productos · /);
    }
    expect(hierarchyIssues(s.units)).toEqual([]);
  });

  it('el stock no duplica pallets mixtos: cada caja suma una sola vez a su SKU', () => {
    const total = [...inventoryTotals(s).values()].reduce((a, b) => a + b, 0);
    const leaves = s.units.filter((u) => !s.units.some((x) => x.parentId === u.id));
    expect(total).toBe(leaves.reduce((a, u) => a + u.quantityBaseUnits, 0));
  });

  it('una caja suelta se identifica por su producto', () => {
    const box = s.units.find((u) => u.type === 'BOX' && u.parentId === null)!;
    const c = unitContents(s, box);
    expect(c.kind).toBe('single');
    expect(c.qty).toBe(box.quantityBaseUnits);
  });
});
