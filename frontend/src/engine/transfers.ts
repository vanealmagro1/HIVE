// Ejecución SIMULADA de una recomendación de redistribución (traslado interno entre bodegas).
//   Aprobar        → se planifica el movimiento (PLANNED): pallets completos disponibles, origen y destino válidos.
//   Simular        → IN_PROGRESS: los pallets salen de su rack hacia el muelle; el inventario aún NO cambia.
//   Confirmar      → COMPLETED: se valida la cantidad recibida, el stock pasa de origen a destino y se registra
//                    como transferencia interna (NO es demanda). El total entre bodegas se conserva.
// Funciones puras: reciben el estado y devuelven uno nuevo (o un error sin cambios).
import { childrenOf, stockBySku } from '../domain/inventory';
import type { LogisticUnit, Movement, Recommendation, RemoteSite, Task } from '../domain/types';
import { appendAudit, computeAnalytics, type DemoState } from '../store/demoState';

/** Horas fijas de la demo (no se usa el reloj del equipo). */
export const EXECUTION_START_TIME = '2026-11-19T10:25:00Z';
export const RECEPTION_CONFIRM_TIME = '2026-11-19T11:05:00Z';

export interface TransferCandidate {
  site: RemoteSite;
  stock: number;
  dailyDemand: number;
  coverageDays: number;
  /** Unidades que le faltan para llegar a la cobertura objetivo. */
  deficit: number;
}

export type PlanResult =
  | { ok: true; unitIds: string[]; originLocationIds: string[]; destination: TransferCandidate }
  | { ok: false; reason: string };

const targetDays = (state: DemoState, skuId: string) => state.policies.find((p) => p.skuId === skuId)?.targetCoverageDays ?? 30;

/** Bodegas que pueden recibir el SKU: tienen demanda registrada y les falta stock para su cobertura objetivo. */
export function transferCandidates(state: DemoState, skuId: string): TransferCandidate[] {
  const target = targetDays(state, skuId);
  return state.remoteSites
    .filter((s) => (s.dailyDemandBySku[skuId] ?? 0) > 0)
    .map((site) => {
      const stock = site.stockBySku[skuId] ?? 0;
      const dailyDemand = site.dailyDemandBySku[skuId];
      return { site, stock, dailyDemand, coverageDays: stock / dailyDemand, deficit: Math.max(0, Math.round(dailyDemand * target - stock)) };
    })
    .filter((c) => c.deficit > 0)
    .sort((a, b) => a.coverageDays - b.coverageDays);
}

/** Unidades comprometidas en un movimiento que aún no termina. */
function committedUnits(state: DemoState): Set<string> {
  return new Set(state.movements.filter((m) => m.status !== 'COMPLETED').flatMap((m) => m.unitIds));
}

/** Pallets completos del SKU que pueden moverse: sin discrepancia abierta, en su ubicación y no comprometidos. */
export function availablePallets(state: DemoState, skuId: string): LogisticUnit[] {
  const lots = new Set(state.lots.filter((l) => l.skuId === skuId).map((l) => l.id));
  const busy = committedUnits(state);
  const alerting = new Set(state.alerts.filter((a) => a.status !== 'RESOLVED').map((a) => a.unitId));
  return state.units
    .filter((u) => u.type === 'PALLET' && !u.parentId && u.lotId !== null && lots.has(u.lotId))
    .filter((u) => u.verificationStatus !== 'PENDING_VERIFICATION' && !alerting.has(u.id) && !busy.has(u.id))
    .filter((u) => !u.observedLocationId || u.observedLocationId === u.expectedLocationId)
    .filter((u) => !u.expectedLocationId.startsWith('REC-'));
}

/** Prepara el traslado: elige pallets completos que sumen exactamente la cantidad y valida el destino. */
export function planTransfer(state: DemoState, skuId: string, quantity: number, destinationId?: string): PlanResult {
  if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, reason: 'Cantidad inválida para trasladar.' };
  const candidates = transferCandidates(state, skuId);
  const destination = destinationId ? candidates.find((c) => c.site.warehouseId === destinationId) : candidates[0];
  if (!destination) return { ok: false, reason: 'No hay una bodega destino con déficit de cobertura para este producto.' };
  if (quantity > destination.deficit) {
    return { ok: false, reason: `${destination.site.name} solo necesita ${destination.deficit} u para su cobertura objetivo.` };
  }
  // Pallets completos (no se parten cajas en la demo). Orden determinista: del último pallet al primero.
  const pallets = availablePallets(state, skuId).sort((a, b) => b.id.localeCompare(a.id));
  const chosen: LogisticUnit[] = [];
  let sum = 0;
  for (const p of pallets) {
    if (sum + p.quantityBaseUnits > quantity) continue;
    chosen.push(p);
    sum += p.quantityBaseUnits;
    if (sum === quantity) break;
  }
  if (sum !== quantity) return { ok: false, reason: `No hay pallets completos disponibles que sumen ${quantity} u (disponible: ${sum} u).` };
  return { ok: true, unitIds: chosen.map((u) => u.id), originLocationIds: chosen.map((u) => u.expectedLocationId), destination };
}

/** Crea el movimiento PLANNED asociado a la tarea (se llama al aprobar una recomendación de redistribución). */
export function buildMovement(state: DemoState, rec: Recommendation, task: Task, at: string): { movement: Movement } | { error: string } {
  if (rec.type !== 'REVIEW_EXCESS' || !rec.skuId || !task.quantity) return { error: 'La recomendación no es un traslado.' };
  const plan = planTransfer(state, rec.skuId, task.quantity);
  if (!plan.ok) return { error: plan.reason };
  return {
    movement: {
      id: `mov-${rec.id.replace(/^rec-/, '')}`,
      taskId: task.id,
      recommendationId: rec.id,
      skuId: rec.skuId,
      quantity: task.quantity,
      fromWarehouseId: state.warehouse.id,
      toWarehouseId: plan.destination.site.warehouseId,
      unitIds: plan.unitIds,
      originLocationIds: plan.originLocationIds,
      status: 'PLANNED',
      plannedAt: at,
      startedAt: null,
      completedAt: null,
      receivedQuantity: null,
      before: null,
      after: null,
      shippedUnits: [],
    },
  };
}

const fail = (state: DemoState, text: string): DemoState => ({ ...state, lastMessage: { kind: 'error', text } });
const warn = (state: DemoState, text: string): DemoState => ({ ...state, lastMessage: { kind: 'warning', text } });

export const siteName = (state: DemoState, warehouseId: string) => (warehouseId === state.warehouse.id
  ? state.warehouse.name : state.remoteSites.find((s) => s.warehouseId === warehouseId)?.name ?? warehouseId);

/** Stock del SKU en una bodega (la principal se calcula desde sus unidades hoja; las otras, agregadas). */
export function siteStock(state: DemoState, warehouseId: string, skuId: string): number {
  if (warehouseId === state.warehouse.id) return stockBySku(state.units, state.lots).get(skuId) ?? 0;
  return state.remoteSites.find((s) => s.warehouseId === warehouseId)?.stockBySku[skuId] ?? 0;
}

/** Simular ejecución: solo con la tarea aprobada y abierta; revalida que los pallets sigan disponibles. */
export function startMovement(state: DemoState, movementId: string, at: string): DemoState {
  const m = state.movements.find((x) => x.id === movementId);
  if (!m) return fail(state, `Movimiento inexistente: ${movementId}`);
  if (m.status === 'IN_PROGRESS') return warn(state, `${m.id} ya está en ejecución; no se duplica.`);
  if (m.status === 'COMPLETED') return warn(state, `${m.id} ya se completó; no se repite.`);
  const task = state.tasks.find((t) => t.id === m.taskId);
  const rec = state.recommendations.find((r) => r.id === m.recommendationId);
  if (!task || task.status !== 'OPEN' || rec?.status !== 'APPROVED') return fail(state, `${m.id}: la ejecución requiere una recomendación aprobada.`);
  const free = new Set(availablePallets({ ...state, movements: state.movements.filter((x) => x.id !== m.id) }, m.skuId).map((u) => u.id));
  const blocked = m.unitIds.filter((id) => !free.has(id));
  if (blocked.length) return fail(state, `${m.id}: ${blocked.join(', ')} ya no está disponible para trasladar.`);
  const before = { originStock: siteStock(state, m.fromWarehouseId, m.skuId), destinationStock: siteStock(state, m.toWarehouseId, m.skuId) };
  const text = `Movimiento ${m.id} en ejecución (simulado): ${m.quantity} u de ${m.skuId} · ${m.unitIds.join(', ')} `
    + `de ${m.originLocationIds.join(', ')} → ${siteName(state, m.toWarehouseId)}.`;
  return {
    ...state,
    movements: state.movements.map((x) => (x.id === m.id ? { ...x, status: 'IN_PROGRESS', startedAt: at, before } : x)),
    tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, status: 'IN_PROGRESS' } : t)),
    audit: appendAudit(state, text),
    lastMessage: { kind: 'info', text },
  };
}

/** Confirmar recepción: explícita, valida la cantidad y mueve el stock (sin duplicar si se pulsa dos veces). */
export function confirmMovement(state: DemoState, movementId: string, receivedQuantity: number, at: string): DemoState {
  const m = state.movements.find((x) => x.id === movementId);
  if (!m) return fail(state, `Movimiento inexistente: ${movementId}`);
  if (m.status === 'COMPLETED') return warn(state, `${m.id} ya fue recibido; la recepción no se duplica.`);
  if (m.status !== 'IN_PROGRESS') return fail(state, `${m.id}: primero hay que simular la ejecución.`);
  if (receivedQuantity !== m.quantity) {
    return fail(state, `${m.id}: se recibieron ${receivedQuantity} u y se enviaron ${m.quantity} u. Revisa la diferencia antes de confirmar.`);
  }
  const moving = new Set(m.unitIds.flatMap((id) => [id, ...childrenOf(state.units, id).map((c) => c.id)]));
  const shippedUnits = state.units.filter((u) => moving.has(u.id));
  const units = state.units.filter((u) => !moving.has(u.id));
  const remoteSites = state.remoteSites.map((s) => (s.warehouseId === m.toWarehouseId
    ? { ...s, stockBySku: { ...s.stockBySku, [m.skuId]: (s.stockBySku[m.skuId] ?? 0) + receivedQuantity } } : s));
  const next = { ...state, units, remoteSites };
  const after = { originStock: siteStock(next, m.fromWarehouseId, m.skuId), destinationStock: siteStock(next, m.toWarehouseId, m.skuId) };
  const text = `Recepción confirmada en ${siteName(state, m.toWarehouseId)}: ${receivedQuantity} u de ${m.skuId} (${m.id}). `
    + 'Traslado interno: no es venta ni despacho; el stock total se conserva.';
  return {
    ...next,
    movements: state.movements.map((x) => (x.id === m.id ? { ...x, status: 'COMPLETED', completedAt: at, receivedQuantity, after, shippedUnits } : x)),
    tasks: state.tasks.map((t) => (t.id === m.taskId ? { ...t, status: 'DONE' } : t)),
    internalTransfers: [...state.internalTransfers, {
      skuId: m.skuId, date: at.slice(0, 10), baseUnits: receivedQuantity,
      note: `Traslado interno ${siteName(state, m.fromWarehouseId)} → ${siteName(state, m.toWarehouseId)} (${m.id}; no es demanda)`,
    }],
    ui: { ...state.ui, selectedUnitId: state.ui.selectedUnitId && moving.has(state.ui.selectedUnitId) ? null : state.ui.selectedUnitId },
    audit: appendAudit(state, text),
    lastMessage: { kind: 'info', text },
  };
}

export interface SiteFigures { name: string; stock: number; dailyDemand: number | null; coverageDays: number | null; exposureUsd: number }
export interface TransferComparison {
  origin: { before: SiteFigures; after: SiteFigures };
  destination: { before: SiteFigures; after: SiteFigures };
  totalBefore: number;
  totalAfter: number;
  /** false mientras no se confirme la recepción: "después" es lo previsto, no lo ocurrido. */
  confirmed: boolean;
}

/**
 * Antes/después por bodega. Demanda de origen = la de la analítica (despachos a clientes, 30 días); destino = la reportada
 * por esa bodega. Exposición = exceso sobre la cobertura objetivo × costo unitario. El total entre bodegas se conserva.
 */
export function transferComparison(state: DemoState, m: Movement): TransferComparison {
  const sku = state.skus.find((k) => k.id === m.skuId);
  const cost = sku?.unitCost ?? 0;
  const target = targetDays(state, m.skuId);
  const originDemand = computeAnalytics(state).find((x) => x.skuId === m.skuId)?.dailyDemand ?? null;
  const destDemand = state.remoteSites.find((s) => s.warehouseId === m.toWarehouseId)?.dailyDemandBySku[m.skuId] ?? null;
  const fig = (name: string, stock: number, demand: number | null): SiteFigures => ({
    name, stock, dailyDemand: demand,
    coverageDays: demand ? stock / demand : null,
    exposureUsd: demand ? Math.max(0, stock - demand * target) * cost : 0,
  });
  const before = m.before ?? { originStock: siteStock(state, m.fromWarehouseId, m.skuId), destinationStock: siteStock(state, m.toWarehouseId, m.skuId) };
  const after = m.after ?? { originStock: before.originStock - m.quantity, destinationStock: before.destinationStock + m.quantity };
  const on = siteName(state, m.fromWarehouseId);
  const dn = siteName(state, m.toWarehouseId);
  return {
    origin: { before: fig(on, before.originStock, originDemand), after: fig(on, after.originStock, originDemand) },
    destination: { before: fig(dn, before.destinationStock, destDemand), after: fig(dn, after.destinationStock, destDemand) },
    totalBefore: before.originStock + before.destinationStock,
    totalAfter: after.originStock + after.destinationStock,
    confirmed: m.status === 'COMPLETED',
  };
}
