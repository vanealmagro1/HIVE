// Fechas de ingreso a bodega (datos SINTÉTICOS) para el semáforo de antigüedad.
// Usa su PROPIO generador aleatorio: no altera la secuencia del generador de inventario ni las cifras del guion.
import { addDays } from '../domain/dates';
import type { DailyDemand, Lot, LogisticUnit, RemoteSite } from '../domain/types';
import { mulberry32 } from './generator';

/** Antigüedad fija (días) de las cajas con beacon: al leerlas en vivo, el semáforo se ve en los tres colores. */
export const BEACON_BOX_AGE_DAYS: Record<string, number> = {
  'CJ-0003': 342, // beacon 4 · rojo crítico (> 330 días)
  'CJ-0022': 24, // beacon 7 · verde
  'CJ-0086': 128, // beacon 5 · ámbar
  'CJ-0138': 15, // beacon 11 · verde
  'CJ-0164': 214, // beacon 01 · rojo
};

/**
 * Asigna `receivedAt` a cada unidad. La antigüedad depende del SKU: la mayoría rota bien (verde), una parte se
 * estanca (ámbar) y unos pocos son inventario hueso (rojo). Los SKU sin demanda reciente son los más viejos.
 */
export function assignReceiptDates(units: LogisticUnit[], lots: Lot[], dailyDemand: DailyDemand[], referenceDate: string, recentSince: string): LogisticUnit[] {
  const rnd = mulberry32(330_2026);
  const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const skuOfLot = new Map(lots.map((l) => [l.id, l.skuId]));
  const recent = new Set(dailyDemand.filter((d) => d.date >= recentSince).map((d) => d.skuId));

  // Antigüedad base por SKU (orden estable de lotes para que sea determinista).
  const baseBySku = new Map<string, number>();
  for (const l of [...lots].sort((a, b) => a.id.localeCompare(b.id))) {
    if (baseBySku.has(l.skuId)) continue;
    const p = rnd();
    const base = !recent.has(l.skuId) ? between(300, 420)
      : p < 0.68 ? between(6, 80)
        : p < 0.88 ? between(95, 170)
          : between(190, 400);
    baseBySku.set(l.skuId, base);
  }
  const dated = units.map((u) => {
    const sku = u.lotId ? skuOfLot.get(u.lotId) : undefined;
    const fixed = BEACON_BOX_AGE_DAYS[u.id];
    const base = fixed ?? (sku ? baseBySku.get(sku) : undefined);
    if (base === undefined) return u;
    const jitter = fixed !== undefined ? 0 : between(0, 8);
    return { ...u, receivedAt: addDays(referenceDate, -(base - jitter)) };
  });
  // Cajas dentro de un pallet: misma fecha que el pallet si es de un solo lote; el pallet mixto toma la más antigua.
  const byId = new Map(dated.map((u) => [u.id, u]));
  return dated.map((u) => {
    if (u.parentId) {
      const parent = byId.get(u.parentId);
      return parent?.lotId && parent.receivedAt ? { ...u, receivedAt: parent.receivedAt } : u;
    }
    if (u.type === 'PALLET' && !u.lotId) {
      const kids = dated.filter((k) => k.parentId === u.id && k.receivedAt).map((k) => k.receivedAt!);
      return kids.length ? { ...u, receivedAt: kids.sort()[0] } : u;
    }
    return u;
  });
}

/**
 * La bodega Quito Sur vende algunos productos que aquí son inventario hueso (pallets de más de 180 días):
 * así la recomendación "mover inventario hueso" tiene un destino real con déficit.
 */
export function withAgedDemandAtSouth(sites: RemoteSite[], units: LogisticUnit[], lots: Lot[], referenceDate: string, targetDays: number, exclude: string[] = [], max = 2): RemoteSite[] {
  const skuOfLot = new Map(lots.map((l) => [l.id, l.skuId]));
  const oldPallets = units
    .filter((u) => u.type === 'PALLET' && !u.parentId && u.lotId && u.receivedAt && addDays(u.receivedAt, 180) < referenceDate)
    .sort((a, b) => (a.receivedAt! < b.receivedAt! ? -1 : 1) || a.id.localeCompare(b.id));
  const picked = new Map<string, number>();
  for (const p of oldPallets) {
    const sku = skuOfLot.get(p.lotId!)!;
    if (exclude.includes(sku)) continue; // productos con su propia historia en el guion
    if (picked.size >= max && !picked.has(sku)) continue;
    picked.set(sku, (picked.get(sku) ?? 0) + p.quantityBaseUnits);
  }
  return sites.map((s, i) => {
    if (i !== 0) return s;
    const stockBySku = { ...s.stockBySku };
    const dailyDemandBySku = { ...s.dailyDemandBySku };
    for (const [sku, qty] of picked) {
      if (dailyDemandBySku[sku]) continue;
      stockBySku[sku] = 0;
      dailyDemandBySku[sku] = Math.ceil(qty / targetDays) + 1; // le falta al menos lo que hay en pallets viejos
    }
    return { ...s, stockBySku, dailyDemandBySku };
  });
}
