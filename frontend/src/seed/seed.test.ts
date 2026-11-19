import { describe, expect, it } from 'vitest';
import { createSeed } from './seed';
import { hierarchyIssues, leafUnits, stockBySku } from '../domain/inventory';

describe('semilla de demo', () => {
  const seed = createSeed();

  it('tiene la estructura mínima: 1 bodega, 3 zonas, 2 racks/zona, 3 niveles, ≥12 ubicaciones', () => {
    expect(seed.zones).toHaveLength(3);
    expect(seed.racks).toHaveLength(6);
    for (const z of seed.zones) expect(seed.racks.filter((r) => r.zoneId === z.id)).toHaveLength(2);
    for (const r of seed.racks) {
      expect(seed.locations.filter((l) => l.rackId === r.id).map((l) => l.level).sort()).toEqual([1, 2, 3]);
    }
    expect(seed.locations.length).toBeGreaterThanOrEqual(12);
    expect(new Set(seed.locations.map((l) => l.id)).size).toBe(seed.locations.length);
  });

  it('tiene 8 pallets y 16 cajas, con PAL-001 esperado en LOC-A1 y LOC-B2 libre', () => {
    expect(seed.units.filter((u) => u.type === 'PALLET')).toHaveLength(8);
    expect(seed.units.filter((u) => u.type === 'BOX')).toHaveLength(16);
    const pal = seed.units.find((u) => u.id === 'PAL-001')!;
    expect(pal.expectedLocationId).toBe('LOC-A1');
    expect(pal.verificationStatus).toBe('EXPECTED');
    expect(seed.locations.some((l) => l.id === 'LOC-B2')).toBe(true);
    expect(seed.units.some((u) => u.expectedLocationId === 'LOC-B2')).toBe(false);
  });

  it('todas las referencias son válidas (ubicaciones, lotes, padres)', () => {
    const locIds = new Set(seed.locations.map((l) => l.id));
    const lotIds = new Set(seed.lots.map((l) => l.id));
    const unitIds = new Set(seed.units.map((u) => u.id));
    for (const u of seed.units) {
      expect(locIds.has(u.expectedLocationId)).toBe(true);
      if (u.lotId) expect(lotIds.has(u.lotId)).toBe(true);
      if (u.parentId) expect(unitIds.has(u.parentId)).toBe(true);
    }
    expect(hierarchyIssues(seed.units)).toEqual([]);
  });

  it('el stock por SKU suma solo cajas (sin doble conteo pallet + cajas)', () => {
    const stock = stockBySku(seed.units, seed.lots);
    expect(stock.get('SKU-A')).toBe(600);
    expect(stock.get('SKU-B')).toBe(120);
    expect(stock.get('SKU-C')).toBe(200);
    const naiveSum = seed.units.reduce((s, u) => s + u.quantityBaseUnits, 0);
    expect(naiveSum).toBe(1840); // lo que daría el doble conteo (2 × 920)
    expect(leafUnits(seed.units).every((u) => u.type === 'BOX')).toBe(true);
  });

  it('createSeed devuelve copias independientes (reset seguro)', () => {
    const a = createSeed();
    a.units[0].quantityBaseUnits = 999;
    expect(createSeed().units[0].quantityBaseUnits).not.toBe(999);
  });
});
