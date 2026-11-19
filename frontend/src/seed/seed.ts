// Semilla FIJA y determinista de la demo. Todas las cifras son FICTICIAS (datos sintéticos).
// Fecha de referencia: 2026-11-19 (ver domain/constants.ts).
import { addDays } from '../domain/dates';
import { REFERENCE_DATE, DEMAND_WINDOW_DAYS, DEFAULT_TARGET_COVERAGE_DAYS } from '../domain/constants';
import type {
  DailyDemand, Location, LogisticUnit, Rack, SeedData, Zone,
} from '../domain/types';

const WAREHOUSE_ID = 'WH-01';

const zones: Zone[] = ['A', 'B', 'C'].map((z) => ({
  id: `Z-${z}`, warehouseId: WAREHOUSE_ID, name: `Zona ${z}`,
}));

// 2 racks por zona.
const racks: Rack[] = zones.flatMap((zone) => {
  const z = zone.id.slice(2);
  return [1, 2].map((n) => ({ id: `R-${z}${n}`, zoneId: zone.id, name: `Rack ${z}${n}` }));
});

// 3 niveles por rack, 1 posición por nivel -> 18 ubicaciones.
// Rack X1 contiene LOC-X1..X3 (niveles 1..3); Rack X2 contiene LOC-X4..X6.
const locations: Location[] = racks.flatMap((rack) => {
  const z = rack.id[2];
  const rackIndex = Number(rack.id[3]); // 1 o 2
  return [1, 2, 3].map((level) => ({
    id: `LOC-${z}${(rackIndex - 1) * 3 + level}`,
    rackId: rack.id,
    level,
    slot: 1,
  }));
});

interface PalletSpec { id: string; lotId: string; locationId: string; boxQty: [number, number] }

// 8 pallets, 2 cajas por pallet = 16 cajas.
// SKU-A: 4 pallets x 150 = 600. SKU-B: 2 x 60 = 120. SKU-C: 2 x 100 = 200.
const palletSpecs: PalletSpec[] = [
  { id: 'PAL-001', lotId: 'LOT-A-01', locationId: 'LOC-A1', boxQty: [75, 75] },
  { id: 'PAL-002', lotId: 'LOT-A-01', locationId: 'LOC-A2', boxQty: [75, 75] },
  { id: 'PAL-003', lotId: 'LOT-A-02', locationId: 'LOC-A4', boxQty: [75, 75] },
  { id: 'PAL-004', lotId: 'LOT-A-02', locationId: 'LOC-A5', boxQty: [75, 75] },
  { id: 'PAL-005', lotId: 'LOT-B-01', locationId: 'LOC-B4', boxQty: [30, 30] },
  { id: 'PAL-006', lotId: 'LOT-B-01', locationId: 'LOC-B5', boxQty: [30, 30] },
  { id: 'PAL-007', lotId: 'LOT-C-01', locationId: 'LOC-C1', boxQty: [50, 50] },
  { id: 'PAL-008', lotId: 'LOT-C-01', locationId: 'LOC-C4', boxQty: [50, 50] },
];

function baseUnit(partial: Pick<LogisticUnit, 'id' | 'type' | 'parentId' | 'lotId' | 'quantityBaseUnits' | 'expectedLocationId'>): LogisticUnit {
  return {
    ...partial,
    observedLocationId: null,
    verificationStatus: 'EXPECTED',
    lastObservedAt: null,
    lastEventId: null,
  };
}

const units: LogisticUnit[] = palletSpecs.flatMap((p) => {
  const n = p.id.slice(4); // '001'
  const boxes = p.boxQty.map((qty, i) => baseUnit({
    id: `BOX-${n}-${i + 1}`,
    type: 'BOX',
    parentId: p.id,
    lotId: p.lotId,
    quantityBaseUnits: qty,
    expectedLocationId: p.locationId,
  }));
  const pallet = baseUnit({
    id: p.id,
    type: 'PALLET',
    parentId: null,
    lotId: p.lotId,
    quantityBaseUnits: p.boxQty[0] + p.boxQty[1], // contenido declarado, no se suma al stock
    expectedLocationId: p.locationId,
  });
  return [pallet, ...boxes];
});

function dailySeries(skuId: string, unitsPerDay: number): DailyDemand[] {
  // Los últimos 30 días ANTES de la fecha de referencia: 2026-10-20 .. 2026-11-18.
  return Array.from({ length: DEMAND_WINDOW_DAYS }, (_, i) => ({
    skuId,
    date: addDays(REFERENCE_DATE, -(DEMAND_WINDOW_DAYS - i)),
    dispatchedBaseUnits: unitsPerDay,
  }));
}

export function createSeed(): SeedData {
  return structuredClone({
    company: { id: 'CMP-DEMO', name: 'Empresa Demo (ficticia)' },
    warehouse: { id: WAREHOUSE_ID, companyId: 'CMP-DEMO', name: 'Bodega Demo Quito (simulada)' },
    zones,
    racks,
    locations,
    skus: [
      { id: 'SKU-A', name: 'Producto A · envase 1 L', unitCost: 8, hasExpiry: false },
      { id: 'SKU-B', name: 'Producto B · perecible', unitCost: 12, hasExpiry: true },
      { id: 'SKU-C', name: 'Producto C · repuesto', unitCost: 5, hasExpiry: false },
    ],
    lots: [
      { id: 'LOT-A-01', skuId: 'SKU-A', expiryDate: null },
      { id: 'LOT-A-02', skuId: 'SKU-A', expiryDate: null },
      { id: 'LOT-B-01', skuId: 'SKU-B', expiryDate: addDays(REFERENCE_DATE, 15) }, // 2026-12-04
      { id: 'LOT-C-01', skuId: 'SKU-C', expiryDate: null },
    ],
    units,
    dailyDemand: [
      ...dailySeries('SKU-A', 10), // 300 en 30 días
      ...dailySeries('SKU-B', 4), // 120 en 30 días
      // SKU-C: un único despacho antiguo, fuera de la ventana de 30 días.
      { skuId: 'SKU-C', date: '2026-08-15', dispatchedBaseUnits: 20 },
    ],
    internalTransfers: [
      { skuId: 'SKU-A', date: '2026-11-10', baseUnits: 40, note: 'Transferencia interna Zona A -> Zona B (no es demanda)' },
    ],
    policies: [
      { skuId: 'SKU-A', targetCoverageDays: DEFAULT_TARGET_COVERAGE_DAYS },
      { skuId: 'SKU-B', targetCoverageDays: DEFAULT_TARGET_COVERAGE_DAYS },
      { skuId: 'SKU-C', targetCoverageDays: DEFAULT_TARGET_COVERAGE_DAYS },
    ],
  } satisfies SeedData);
}
