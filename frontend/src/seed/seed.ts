// Semilla FIJA y determinista de la demo. Todas las cifras son FICTICIAS (datos sintéticos).
// Empresa ficticia del segmento objetivo (retail de papelería y tecnología en Quito, ~12.000 unidades).
// Fecha de referencia: 2026-11-19 (ver domain/constants.ts).
//
// Productos protagonistas del guion (cifras validadas por pruebas):
//   MOC-001 Mochila escolar básica   600 u · 10 u/día · USD 8  → 60 días, exceso 300 u, USD 2.400
//   TIN-001 Cartucho de tinta negra  120 u · 4 u/día · USD 12, lote vence en 15 días → 60 u, USD 720
//   CAL-001 Calculadora de bolsillo  200 u · un despacho antiguo → sin pronóstico; inmovilizado por regla
import { addDays } from '../domain/dates';
import { DEFAULT_TARGET_COVERAGE_DAYS, DEMAND_WINDOW_DAYS, REFERENCE_DATE } from '../domain/constants';
import type { DailyDemand, Lot, LogisticUnit, PurchaseOrder, RemoteSite, SeedData, SKU } from '../domain/types';
import { buildStructure, generateInventory, HERO, LAST_RFID_SWEEP, WAREHOUSE_ID } from './generator';

/** Ubicación libre reservada para el guion: allí el lector de mano "encuentra" PAL-001. */
export const DEMO_OBSERVED_LOCATION = 'D-07-02';

interface PalletSpec { id: string; lotId: string; locationId: string; boxes: number; qty: number }

const HERO_PALLETS: PalletSpec[] = [
  { id: 'PAL-001', lotId: 'L-MOC-001-A', locationId: 'B-03-01', boxes: 6, qty: 25 },
  { id: 'PAL-002', lotId: 'L-MOC-001-A', locationId: 'B-04-01', boxes: 6, qty: 25 },
  { id: 'PAL-003', lotId: 'L-MOC-001-B', locationId: 'B-08-01', boxes: 6, qty: 25 },
  { id: 'PAL-004', lotId: 'L-MOC-001-B', locationId: 'B-09-01', boxes: 6, qty: 25 },
  { id: 'PAL-005', lotId: 'L-TIN-001-A', locationId: 'E-01-01', boxes: 6, qty: 10 },
  { id: 'PAL-006', lotId: 'L-TIN-001-A', locationId: 'E-02-01', boxes: 6, qty: 10 },
  { id: 'PAL-007', lotId: 'L-CAL-001', locationId: 'F-06-01', boxes: 4, qty: 25 },
  { id: 'PAL-008', lotId: 'L-CAL-001', locationId: 'F-09-02', boxes: 4, qty: 25 },
];

/** Orden de compra que llega en el guion: 12 cajas de lápices de colores; el proveedor despacha 11. */
export const DEMO_PO_ID = 'OC-2026-1187';
export const DEMO_PO_MISSING_BOX = 'BOX-901-12';

function demoPurchaseOrder(): PurchaseOrder {
  return {
    id: DEMO_PO_ID,
    supplier: 'Proveedor Escolar del Pacífico S.A. (ficticio)',
    skuId: 'COL-001',
    lotId: 'L-COL-001-A',
    palletId: 'PAL-901',
    dockLocationId: 'REC-01',
    expectedAt: '2026-11-19T08:00:00Z',
    boxes: Array.from({ length: 12 }, (_, i) => ({
      boxId: `BOX-901-${String(i + 1).padStart(2, '0')}`,
      epc: `3034257BF400B7C000${String(1187).padStart(4, '0')}${String(i + 1).padStart(2, '0')}`,
      qty: 24,
    })),
    status: 'EXPECTED',
    receivedBoxIds: [],
    readCount: 0,
    closedAt: null,
  };
}

const HERO_SKUS: SKU[] = [
  { id: HERO.MOCHILA, name: 'Mochila escolar básica', unitCost: 8, hasExpiry: false, category: 'UTI' },
  { id: HERO.TINTA, name: 'Cartucho de tinta negra original', unitCost: 12, hasExpiry: true, category: 'TIN' },
  { id: HERO.CALCULADORA, name: 'Calculadora básica de bolsillo', unitCost: 5, hasExpiry: false, category: 'TEC' },
  { id: 'COL-001', name: 'Lápices de colores x12 · caja escolar', unitCost: 3.6, hasExpiry: false, category: 'ART' },
];

const HERO_LOTS: Lot[] = [
  { id: 'L-MOC-001-A', skuId: HERO.MOCHILA, expiryDate: null },
  { id: 'L-MOC-001-B', skuId: HERO.MOCHILA, expiryDate: null },
  { id: 'L-TIN-001-A', skuId: HERO.TINTA, expiryDate: addDays(REFERENCE_DATE, 15) }, // 2026-12-04
  { id: 'L-CAL-001', skuId: HERO.CALCULADORA, expiryDate: null },
  { id: 'L-COL-001-A', skuId: 'COL-001', expiryDate: null },
];

function heroUnits(): LogisticUnit[] {
  const read = (u: Omit<LogisticUnit, 'observedLocationId' | 'verificationStatus' | 'lastObservedAt' | 'lastEventId'>): LogisticUnit => ({
    ...u, observedLocationId: u.expectedLocationId, verificationStatus: 'OBSERVED', lastObservedAt: LAST_RFID_SWEEP, lastEventId: null,
  });
  return HERO_PALLETS.flatMap((p) => {
    const n = p.id.slice(4);
    const pallet = read({ id: p.id, type: 'PALLET', parentId: null, lotId: p.lotId, quantityBaseUnits: p.boxes * p.qty, expectedLocationId: p.locationId });
    const boxes = Array.from({ length: p.boxes }, (_, i) => read({
      id: `BOX-${n}-${i + 1}`, type: 'BOX', parentId: p.id, lotId: p.lotId, quantityBaseUnits: p.qty, expectedLocationId: p.locationId,
    }));
    return [pallet, ...boxes];
  });
}

function dailySeries(skuId: string, unitsPerDay: number): DailyDemand[] {
  // Los 30 días ANTES de la fecha de referencia: 2026-10-20 .. 2026-11-18.
  return Array.from({ length: DEMAND_WINDOW_DAYS }, (_, i) => ({
    skuId, date: addDays(REFERENCE_DATE, -(DEMAND_WINDOW_DAYS - i)), dispatchedBaseUnits: unitsPerDay,
  }));
}

/**
 * Mochilas: patrón semanal (más despachos a inicio de semana). La suma de los 30 días se mantiene en 300 u
 * (promedio 10 u/día), así que cobertura, exceso y exposición del guion no cambian; la variación permite
 * calcular una banda de variabilidad honesta en la proyección.
 */
const WEEKLY_PATTERN = [1, 2, 2, 1, 0, -3, -3]; // lunes a domingo aprox.: fin de semana con menos despachos
function weeklySeries(skuId: string, unitsPerDay: number): DailyDemand[] {
  const days = Array.from({ length: DEMAND_WINDOW_DAYS }, (_, i) => unitsPerDay + WEEKLY_PATTERN[i % 7]);
  const drift = unitsPerDay * DEMAND_WINDOW_DAYS - days.reduce((t, v) => t + v, 0);
  days[days.length - 1] += drift; // cierre exacto del total de la ventana
  return days.map((qty, i) => ({ skuId, date: addDays(REFERENCE_DATE, -(DEMAND_WINDOW_DAYS - i)), dispatchedBaseUnits: qty }));
}

/**
 * Cajas sueltas con un beacon Estimote como etiqueta (demo en vivo, línea papelería · Zona A).
 * Arrancan SIN lectura reciente (último conteo fue manual): la lectura del beacon las verifica.
 * La etiqueta coincide con el número escrito en cada beacon y con beacons/beacons.json.
 */
export const BEACON_BOXES: { label: string; unitId: string }[] = [
  { label: '4', unitId: 'CJ-0003' },  // Cuaderno universitario 100 h cuadros grandes · B-05-03
  { label: '7', unitId: 'CJ-0022' },  // Esferográfico punta fina negro · B-01-03
  { label: '5', unitId: 'CJ-0086' },  // Lápices de colores 12 colores · A-08-03
  { label: '11', unitId: 'CJ-0138' }, // Regla 30 cm estándar · B-08-02
  { label: '01', unitId: 'CJ-0164' }, // Borrador blanco escolar · A-03-02
];
const BEACON_UNIT_IDS = new Set(BEACON_BOXES.map((b) => b.unitId));

function withBeaconBoxesUnread(units: LogisticUnit[]): LogisticUnit[] {
  return units.map((u) => (BEACON_UNIT_IDS.has(u.id)
    ? { ...u, verificationStatus: 'EXPECTED', observedLocationId: null, lastObservedAt: null }
    : u));
}

/** Segunda bodega de la empresa (destino de la redistribución). Cifras SINTÉTICAS. */
export const SOUTH_WAREHOUSE_ID = 'WH-QUITO-SUR';
function remoteSites(): RemoteSite[] {
  return [{
    warehouseId: SOUTH_WAREHOUSE_ID,
    name: 'Bodega Quito Sur (simulada)',
    dockName: 'Muelle D2',
    stockBySku: { [HERO.MOCHILA]: 90 },
    dailyDemandBySku: { [HERO.MOCHILA]: 13 },
  }];
}

function buildSeed(): SeedData {
  const { zones, racks, locations } = buildStructure();
  const reserved = new Set([...HERO_PALLETS.map((p) => p.locationId), DEMO_OBSERVED_LOCATION]);
  const gen = generateInventory({ referenceDate: REFERENCE_DATE, windowDays: DEMAND_WINDOW_DAYS, locations, racks, reserved });
  return {
    company: { id: 'CMP-DEMO', name: 'Distribuidora Andina · Papelería y Tecnología (ficticia)' },
    warehouse: { id: WAREHOUSE_ID, companyId: 'CMP-DEMO', name: 'Bodega Quito Norte (simulada)' },
    zones,
    racks,
    locations,
    skus: [...HERO_SKUS, ...gen.skus],
    lots: [...HERO_LOTS, ...gen.lots],
    units: withBeaconBoxesUnread([...heroUnits(), ...gen.units]),
    dailyDemand: [
      ...weeklySeries(HERO.MOCHILA, 10), // 300 en 30 días (patrón semanal)
      ...dailySeries(HERO.TINTA, 4), // 120 en 30 días
      // Calculadora: un único despacho antiguo, fuera de la ventana de 30 días.
      { skuId: HERO.CALCULADORA, date: '2026-08-15', dispatchedBaseUnits: 20 },
      ...gen.dailyDemand,
    ],
    internalTransfers: [
      { skuId: HERO.MOCHILA, date: '2026-11-10', baseUnits: 40, note: 'Transferencia interna Bodega Quito Norte → local Centro (no es demanda)' },
    ],
    policies: HERO_SKUS.map((s) => ({ skuId: s.id, targetCoverageDays: DEFAULT_TARGET_COVERAGE_DAYS })),
    purchaseOrders: [demoPurchaseOrder()],
    remoteSites: remoteSites(),
  };
}

const SEED: SeedData = buildSeed();

/** Copia independiente de la semilla (cada reinicio parte del mismo estado). */
export function createSeed(): SeedData {
  return structuredClone(SEED);
}
