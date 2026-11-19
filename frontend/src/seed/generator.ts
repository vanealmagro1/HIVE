// Generador DETERMINISTA de la bodega de demostración (datos SINTÉTICOS).
// Empresa ficticia del tipo "retail de papelería y tecnología" de Quito (segmento objetivo del análisis
// estratégico: 10.000–20.000 unidades físicas). No usa nombres, marcas ni datos de empresas reales.
//
// Estructura:
//   Zona A Útiles escolares (P1–P2) · Zona B Tecnología y accesorios (P3–P4) · Zona C Oficina y consumibles (P5–P6)
//   Cada pasillo tiene un rack a cada lado (I/D) de 5 bahías × 3 niveles → 180 ubicaciones de almacenamiento.
//   Andén de recepción con portal RFID y 4 posiciones de recepción (REC-01…REC-04).
//   Productos de volumen en pallets de un solo lote; productos pequeños en cajas sueltas (todas con etiqueta RFID).
import { addDays } from '../domain/dates';
import type { DailyDemand, Location, Lot, LogisticUnit, Rack, SKU, Zone } from '../domain/types';

export const WAREHOUSE_ID = 'WH-QN';
export const AISLES_PER_ZONE = 2;
export const BAYS = 5;
export const LEVELS = 3;
/** Cierre del último inventario RFID simulado (todas las etiquetas leídas en su ubicación). */
export const LAST_RFID_SWEEP = '2026-11-18T18:30:00Z';

/** PRNG mulberry32: misma semilla → mismos datos en cualquier equipo. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STORAGE_ZONES: { id: string; letter: string; category: string }[] = [
  { id: 'Z-A', letter: 'A', category: 'Útiles escolares' },
  { id: 'Z-B', letter: 'B', category: 'Tecnología y accesorios' },
  { id: 'Z-C', letter: 'C', category: 'Oficina y consumibles' },
];

export const RECEIVING_ZONE_ID = 'Z-REC';
export const RECEIVING_RACK_ID = 'R-REC';

export function buildStructure(): { zones: Zone[]; racks: Rack[]; locations: Location[] } {
  const zones: Zone[] = STORAGE_ZONES.map((z) => ({
    id: z.id, warehouseId: WAREHOUSE_ID, name: `Zona ${z.letter}`, kind: 'STORAGE', category: z.category,
  }));
  zones.push({ id: RECEIVING_ZONE_ID, warehouseId: WAREHOUSE_ID, name: 'Andén de recepción', kind: 'RECEIVING', category: 'Recepción' });

  const racks: Rack[] = [];
  const locations: Location[] = [];
  STORAGE_ZONES.forEach((z, zi) => {
    for (let k = 1; k <= AISLES_PER_ZONE; k += 1) {
      const aisle = zi * AISLES_PER_ZONE + k;
      for (const side of ['I', 'D'] as const) {
        const rackId = `R-P${aisle}${side}`;
        racks.push({ id: rackId, zoneId: z.id, name: `Pasillo ${aisle} ${side === 'I' ? 'izq.' : 'der.'}`, aisle, side });
        for (let bay = 1; bay <= BAYS; bay += 1) {
          for (let level = 1; level <= LEVELS; level += 1) {
            locations.push({ id: locationId(aisle, side, bay, level), rackId, level, slot: bay });
          }
        }
      }
    }
  });
  racks.push({ id: RECEIVING_RACK_ID, zoneId: RECEIVING_ZONE_ID, name: 'Posiciones de recepción' });
  for (let slot = 1; slot <= 4; slot += 1) {
    locations.push({ id: `REC-0${slot}`, rackId: RECEIVING_RACK_ID, level: 1, slot });
  }
  return { zones, racks, locations };
}

export function locationId(aisle: number, side: 'I' | 'D', bay: number, level: number): string {
  return `P${aisle}-${side}${String(bay).padStart(2, '0')}-N${level}`;
}

// ---------------------------------------------------------------------------------------------
// Catálogo: base × variante. [nombre, costo USD, unidades por caja, ¿producto de volumen (pallet)?]
type Base = [string, number, number, boolean];
interface CategoryDef { zoneId: string; prefix: string; bases: Base[]; variants: string[]; hasExpiry?: boolean }

const CATALOG: CategoryDef[] = [
  { zoneId: 'Z-A', prefix: 'CUA', variants: ['cuadros', 'líneas', 'doble línea', 'cuadros grandes'], bases: [
    ['Cuaderno universitario 100 h', 1.15, 50, true], ['Cuaderno escolar 60 h', 0.75, 60, true], ['Cuaderno espiral 200 h', 2.4, 30, true]] },
  { zoneId: 'Z-A', prefix: 'ESC', variants: ['azul', 'negro', 'rojo', 'surtido x4'], bases: [
    ['Esferográfico punta fina', 0.22, 120, false], ['Lápiz HB', 0.12, 144, false], ['Marcador permanente', 0.55, 48, false],
    ['Resaltador', 0.45, 48, false], ['Corrector líquido', 0.6, 36, false]] },
  { zoneId: 'Z-A', prefix: 'ART', variants: ['12 colores', '24 colores', 'pastel', 'fluorescente'], bases: [
    ['Lápices de colores', 1.8, 24, false], ['Crayones', 0.9, 36, false], ['Témperas', 1.6, 24, false], ['Plastilina', 0.85, 36, false]] },
  { zoneId: 'Z-A', prefix: 'UTI', variants: ['estándar', 'escolar', 'infantil'], bases: [
    ['Regla 30 cm', 0.35, 60, false], ['Tijera punta roma', 0.7, 48, false], ['Goma en barra 21 g', 0.55, 48, false],
    ['Borrador blanco', 0.15, 120, false], ['Sacapuntas metálico', 0.2, 100, false], ['Cartuchera', 2.1, 24, false],
    ['Lonchera térmica', 4.5, 12, true], ['Mochila con ruedas', 14.5, 8, true]] },
  { zoneId: 'Z-B', prefix: 'TEC', variants: ['negro', 'blanco', 'gris'], bases: [
    ['Mouse óptico USB', 5.8, 20, false], ['Teclado USB', 9.5, 10, true], ['Audífonos con micrófono', 7.2, 20, false],
    ['Parlante bluetooth', 11.0, 12, true], ['Cámara web HD', 14.0, 10, true]] },
  { zoneId: 'Z-B', prefix: 'ACC', variants: ['1 m', '2 m', 'tipo C', 'micro USB'], bases: [
    ['Cable USB', 1.4, 50, false], ['Cargador de pared', 3.9, 30, false], ['Memoria USB 32 GB', 4.6, 50, false],
    ['Memoria USB 64 GB', 6.8, 50, false], ['Regleta 6 tomas', 5.5, 20, true], ['Pilas AA x4', 1.9, 48, false]] },
  { zoneId: 'Z-C', prefix: 'RES', variants: ['A4 75 g', 'carta 75 g', 'A4 80 g'], bases: [
    ['Resma de papel bond', 4.2, 5, true], ['Papel reciclado', 3.6, 5, true]] },
  { zoneId: 'Z-C', prefix: 'OFI', variants: ['oficio', 'A4', 'carta', 'colores'], bases: [
    ['Carpeta plástica', 0.4, 100, false], ['Archivador de palanca', 2.3, 24, true], ['Sobre manila', 0.12, 100, false],
    ['Notas adhesivas 3x3', 0.65, 48, false], ['Grapas 26/6 x5000', 0.95, 40, false], ['Clips mariposa x50', 0.8, 40, false],
    ['Cinta adhesiva 18 mm', 0.45, 72, false]] },
  { zoneId: 'Z-C', prefix: 'TIN', hasExpiry: true, variants: ['negro', 'tricolor', 'cian', 'magenta'], bases: [
    ['Cartucho de tinta compatible', 9.5, 12, false], ['Botella de tinta 70 ml', 4.8, 24, false], ['Tóner compatible', 18.0, 6, false]] },
];

/** Presentaciones: unidad suelta o paquete (multiplica el catálogo como en un retail real). */
const PACKS = [
  { suffix: '', costFactor: 1, skip: 0.1 },
  { suffix: ' · paquete x3', costFactor: 2.8, skip: 0.35 },
];

// Productos protagonistas del guion (cifras fijas y validadas por pruebas).
export const HERO = {
  MOCHILA: 'MOC-001',
  TINTA: 'TIN-001',
  CALCULADORA: 'CAL-001',
} as const;

export interface GeneratedData {
  skus: SKU[];
  lots: Lot[];
  units: LogisticUnit[];
  dailyDemand: DailyDemand[];
}

function unit(p: Pick<LogisticUnit, 'id' | 'type' | 'parentId' | 'lotId' | 'quantityBaseUnits' | 'expectedLocationId'>): LogisticUnit {
  // Estado inicial: todas las etiquetas respondieron en su ubicación en el último inventario RFID (simulado).
  return { ...p, observedLocationId: p.expectedLocationId, verificationStatus: 'OBSERVED', lastObservedAt: LAST_RFID_SWEEP, lastEventId: null };
}

/**
 * Genera catálogo, inventario y demanda de los últimos `windowDays` días.
 * `reserved` son ubicaciones que el generador no debe ocupar (guion de la demo).
 */
export function generateInventory(opts: {
  referenceDate: string; windowDays: number; locations: Location[]; racks: Rack[]; reserved: Set<string>; seed?: number;
}): GeneratedData {
  const rnd = mulberry32(opts.seed ?? 20261119);
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const rackZone = new Map(opts.racks.map((r) => [r.id, r.zoneId]));

  const skus: SKU[] = [];
  const lots: Lot[] = [];
  const units: LogisticUnit[] = [];
  const dailyDemand: DailyDemand[] = [];

  // Ubicaciones libres por zona, en orden de pasillo/bahía/nivel (nivel 1 primero para pallets).
  const free = new Map<string, Location[]>();
  for (const l of opts.locations) {
    const z = rackZone.get(l.rackId)!;
    if (!z.startsWith('Z-') || z === RECEIVING_ZONE_ID || opts.reserved.has(l.id)) continue;
    free.set(z, [...(free.get(z) ?? []), l]);
  }
  for (const list of free.values()) list.sort((a, b) => a.level - b.level || a.rackId.localeCompare(b.rackId) || a.slot - b.slot);
  // Estanterías con cajas sueltas: hasta 5 cajas por ubicación.
  const shelfFill = new Map<string, number>();
  const takePalletSpot = (zoneId: string) => free.get(zoneId)?.shift();
  const takeShelfSpot = (zoneId: string) => {
    const list = free.get(zoneId) ?? [];
    for (const l of [...list].reverse()) { // niveles altos primero para cajas sueltas
      const n = shelfFill.get(l.id) ?? 0;
      if (n < 5) { shelfFill.set(l.id, n + 1); if (n + 1 === 5) list.splice(list.indexOf(l), 1); return l; }
    }
    return undefined;
  };

  let palletSeq = 100; // PAL-001…PAL-008 son del guion; los generados empiezan en PAL-101.
  let looseSeq = 0;

  for (const cat of CATALOG) {
    let n = 1;
    for (const [baseName, baseCost0, perBox0, bulk] of cat.bases) {
      for (const variant of cat.variants) for (const pack of PACKS) {
        if (rnd() < pack.skip) continue; // no todas las combinaciones existen
        n += 1;
        const id = `${cat.prefix}-${String(n).padStart(3, '0')}`;
        const baseCost = baseCost0 * pack.costFactor;
        const perBox = Math.max(2, Math.round(perBox0 / pack.costFactor));
        const cost = Math.round(baseCost * (0.9 + rnd() * 0.25) * 100) / 100;
        const sku: SKU = { id, name: `${baseName} ${variant}${pack.suffix}`, unitCost: cost, hasExpiry: !!cat.hasExpiry, category: cat.prefix };
        const lot: Lot = { id: `L-${id}`, skuId: id, expiryDate: cat.hasExpiry ? addDays(opts.referenceDate, between(150, 420)) : null };

        let stock = 0;
        if (bulk && rnd() < 0.75) {
          const spot = takePalletSpot(cat.zoneId);
          if (!spot) continue;
          palletSeq += 1;
          const palletId = `PAL-${palletSeq}`;
          const boxes = between(3, 6);
          const qty = Math.max(4, Math.round(perBox * (0.6 + rnd() * 0.5)));
          units.push(unit({ id: palletId, type: 'PALLET', parentId: null, lotId: lot.id, quantityBaseUnits: boxes * qty, expectedLocationId: spot.id }));
          for (let b = 1; b <= boxes; b += 1) {
            units.push(unit({ id: `BOX-${palletSeq}-${b}`, type: 'BOX', parentId: palletId, lotId: lot.id, quantityBaseUnits: qty, expectedLocationId: spot.id }));
          }
          stock = boxes * qty;
        } else {
          const boxes = between(1, 3);
          for (let b = 0; b < boxes; b += 1) {
            const spot = takeShelfSpot(cat.zoneId);
            if (!spot) break;
            looseSeq += 1;
            const qty = Math.max(2, Math.round(perBox * (0.4 + rnd() * 0.6)));
            units.push(unit({ id: `CJ-${String(looseSeq).padStart(4, '0')}`, type: 'BOX', parentId: null, lotId: lot.id, quantityBaseUnits: qty, expectedLocationId: spot.id }));
            stock += qty;
          }
          if (stock === 0) continue;
        }
        skus.push(sku);
        lots.push(lot);

        // Demanda: cobertura entre 12 y 33 días (casi todo dentro del objetivo de 30 días).
        const coverage = 12 + rnd() * 21;
        const total = Math.max(8, Math.round((stock / coverage) * opts.windowDays));
        const activeDays = between(Math.min(18, opts.windowDays), opts.windowDays);
        const all = Array.from({ length: opts.windowDays }, (_, i) => i);
        for (let i = all.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
        const days = all.slice(0, activeDays).sort((a, b) => a - b);
        let remaining = total;
        days.forEach((d, i) => {
          const left = days.length - i;
          const q = i === days.length - 1 ? remaining : Math.max(0, Math.round((remaining / left) * (0.6 + rnd() * 0.8)));
          remaining -= q;
          if (q > 0) dailyDemand.push({ skuId: id, date: addDays(opts.referenceDate, -(opts.windowDays - d)), dispatchedBaseUnits: q });
        });
      }
    }
  }
  return { skus, lots, units, dailyDemand };
}
