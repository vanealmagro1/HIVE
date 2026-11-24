// Agregación de inventario. REGLA EXPLÍCITA (sin doble conteo):
//   stock(SKU) = suma de quantityBaseUnits de las unidades HOJA (unidades sin hijos) cuyo lote pertenece al SKU.
//   La cantidad de un pallet con cajas hijas es solo su contenido DECLARADO y nunca se suma además de sus cajas.
//   Un pallet sin cajas registradas sí es una unidad hoja y cuenta por sí mismo.
import type { Lot, LogisticUnit, SKU } from './types';

export function childrenOf(units: LogisticUnit[], parentId: string): LogisticUnit[] {
  return units.filter((u) => u.parentId === parentId);
}

export function leafUnits(units: LogisticUnit[]): LogisticUnit[] {
  const parents = new Set(units.map((u) => u.parentId).filter((p): p is string => p !== null));
  return units.filter((u) => !parents.has(u.id));
}

export function stockByLot(units: LogisticUnit[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const u of leafUnits(units)) {
    if (!u.lotId) continue;
    out.set(u.lotId, (out.get(u.lotId) ?? 0) + u.quantityBaseUnits);
  }
  return out;
}

export function stockBySku(units: LogisticUnit[], lots: Lot[]): Map<string, number> {
  const lotSku = new Map(lots.map((l) => [l.id, l.skuId]));
  const out = new Map<string, number>();
  for (const [lotId, qty] of stockByLot(units)) {
    const skuId = lotSku.get(lotId);
    if (!skuId) continue;
    out.set(skuId, (out.get(skuId) ?? 0) + qty);
  }
  return out;
}

/** Comprueba que el contenido declarado de cada pallet coincide con la suma de sus cajas. */
export function hierarchyIssues(units: LogisticUnit[]): string[] {
  const issues: string[] = [];
  for (const u of units) {
    const kids = childrenOf(units, u.id);
    if (kids.length === 0) continue;
    const sum = kids.reduce((s, k) => s + k.quantityBaseUnits, 0);
    if (sum !== u.quantityBaseUnits) {
      issues.push(`${u.id}: declarado ${u.quantityBaseUnits} ≠ suma de cajas ${sum}`);
    }
    // Pallet de un solo lote: todas sus cajas deben ser de ese lote. Pallet MIXTO (lotId null): líneas de varios SKU.
    if (u.lotId !== null && kids.some((k) => k.lotId !== u.lotId)) issues.push(`${u.id}: cajas con lote distinto al pallet`);
  }
  return issues;
}

export interface UnitDetail {
  unit: LogisticUnit;
  lot: Lot | null;
  sku: SKU | null;
  children: LogisticUnit[];
}

export function unitDetail(units: LogisticUnit[], lots: Lot[], skus: SKU[], unitId: string): UnitDetail | null {
  const unit = units.find((u) => u.id === unitId);
  if (!unit) return null;
  const lot = lots.find((l) => l.id === unit.lotId) ?? null;
  const sku = lot ? skus.find((s) => s.id === lot.skuId) ?? null : null;
  return { unit, lot, sku, children: childrenOf(units, unit.id) };
}
