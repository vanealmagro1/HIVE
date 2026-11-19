import { describe, expect, it } from 'vitest';
import { hierarchyIssues, stockBySku } from './inventory';
import type { LogisticUnit } from './types';

const u = (p: Partial<LogisticUnit> & Pick<LogisticUnit, 'id' | 'type' | 'quantityBaseUnits'>): LogisticUnit => ({
  parentId: null, lotId: 'L1', expectedLocationId: 'LOC-1', observedLocationId: null,
  verificationStatus: 'EXPECTED', lastObservedAt: null, lastEventId: null, ...p,
});

describe('agregación de inventario', () => {
  const lots = [{ id: 'L1', skuId: 'S1', expiryDate: null }];

  it('pallet sin cajas registradas cuenta como unidad hoja', () => {
    expect(stockBySku([u({ id: 'P', type: 'PALLET', quantityBaseUnits: 40 })], lots).get('S1')).toBe(40);
  });

  it('pallet con cajas: cuenta solo las cajas', () => {
    const units = [
      u({ id: 'P', type: 'PALLET', quantityBaseUnits: 50 }),
      u({ id: 'B1', type: 'BOX', parentId: 'P', quantityBaseUnits: 20 }),
      u({ id: 'B2', type: 'BOX', parentId: 'P', quantityBaseUnits: 30 }),
    ];
    expect(stockBySku(units, lots).get('S1')).toBe(50);
    expect(hierarchyIssues(units)).toEqual([]);
  });

  it('detecta pallet cuyo contenido declarado no concilia con sus cajas', () => {
    const units = [
      u({ id: 'P', type: 'PALLET', quantityBaseUnits: 60 }),
      u({ id: 'B1', type: 'BOX', parentId: 'P', quantityBaseUnits: 20 }),
    ];
    expect(hierarchyIssues(units)).toHaveLength(1);
  });
});
