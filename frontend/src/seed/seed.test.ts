import { describe, expect, it } from 'vitest';
import { createSeed, DEMO_OBSERVED_LOCATION } from './seed';
import { hierarchyIssues, leafUnits, stockBySku } from '../domain/inventory';

describe('semilla de demo (bodega de papelería y tecnología, datos sintéticos)', () => {
  const seed = createSeed();

  it('estructura: 3 zonas de almacenamiento + andén, 6 pasillos con rack a cada lado, 5 bahías × 3 niveles', () => {
    const storage = seed.zones.filter((z) => z.kind === 'STORAGE');
    expect(storage).toHaveLength(3);
    expect(seed.zones.filter((z) => z.kind === 'RECEIVING')).toHaveLength(1);
    const aisles = new Set(seed.racks.filter((r) => r.aisle).map((r) => r.aisle));
    expect([...aisles].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const a of aisles) expect(seed.racks.filter((r) => r.aisle === a).map((r) => r.side).sort()).toEqual(['D', 'I']);
    for (const r of seed.racks.filter((x) => x.aisle)) expect(seed.locations.filter((l) => l.rackId === r.id)).toHaveLength(15);
    expect(seed.locations.filter((l) => l.id.startsWith('REC-'))).toHaveLength(4);
    expect(new Set(seed.locations.map((l) => l.id)).size).toBe(seed.locations.length);
  });

  it('tamaño del segmento objetivo: 10.000–20.000 unidades físicas y cientos de productos', () => {
    const total = [...stockBySku(seed.units, seed.lots).values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(10_000);
    expect(total).toBeLessThanOrEqual(20_000);
    expect(seed.skus.length).toBeGreaterThanOrEqual(200);
  });

  it('es determinista: dos generaciones son idénticas', () => {
    expect(createSeed()).toEqual(createSeed());
  });

  it('guion: PAL-001 (mochilas) registrado en B-03-01, leído en el último inventario RFID; D-07-02 libre', () => {
    const pal = seed.units.find((u) => u.id === 'PAL-001')!;
    expect(pal.expectedLocationId).toBe('B-03-01');
    expect(pal.verificationStatus).toBe('OBSERVED');
    expect(pal.observedLocationId).toBe('B-03-01');
    expect(seed.units.some((u) => u.expectedLocationId === DEMO_OBSERVED_LOCATION)).toBe(false);
    expect(seed.units.every((u) => !u.expectedLocationId.startsWith('REC-'))).toBe(true); // andén vacío
  });

  it('todas las referencias son válidas y los pallets cuadran con sus cajas', () => {
    const locIds = new Set(seed.locations.map((l) => l.id));
    const lotIds = new Set(seed.lots.map((l) => l.id));
    const unitIds = new Set(seed.units.map((u) => u.id));
    for (const u of seed.units) {
      expect(locIds.has(u.expectedLocationId)).toBe(true);
      if (u.lotId) expect(lotIds.has(u.lotId)).toBe(true);
      if (u.parentId) expect(unitIds.has(u.parentId)).toBe(true);
    }
    expect(unitIds.size).toBe(seed.units.length);
    expect(hierarchyIssues(seed.units)).toEqual([]);
  });

  it('el stock suma solo unidades hoja (sin doble conteo pallet + cajas); protagonistas exactos', () => {
    const stock = stockBySku(seed.units, seed.lots);
    expect(stock.get('MOC-001')).toBe(600);
    expect(stock.get('TIN-001')).toBe(120);
    expect(stock.get('CAL-001')).toBe(200);
    expect(leafUnits(seed.units).every((u) => u.type === 'BOX')).toBe(true);
    const total = [...stock.values()].reduce((a, b) => a + b, 0);
    const naive = seed.units.reduce((s, u) => s + u.quantityBaseUnits, 0);
    expect(naive).toBeGreaterThan(total); // sumar pallets además de cajas daría de más
  });

  it('createSeed devuelve copias independientes (reset seguro)', () => {
    const a = createSeed();
    a.units[0].quantityBaseUnits = 999;
    expect(createSeed().units[0].quantityBaseUnits).not.toBe(999);
  });
});
