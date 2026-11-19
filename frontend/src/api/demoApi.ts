// Contrato equivalente a la API propuesta (PLAN_MAESTRO §10), implementado como funciones tipadas
// en el navegador. NO existe un servidor HTTP: estas funciones son el punto de sustitución futuro
// por llamadas a FastAPI manteniendo las mismas formas de respuesta.
//   GET  /api/demo/state                    -> getDemoState
//   POST /api/demo/reset                    -> resetDemo
//   POST /api/demo/events                   -> postEvent      (idempotente por event.id; portal, lector de mano o beacon)
//   POST /api/receipts/{id}/close           -> closeReceipt
//   GET  /api/inventory                     -> getInventory
//   GET  /api/alerts                        -> getAlerts
//   GET  /api/analytics                     -> getAnalytics
//   POST /api/recommendations/{id}/approve  -> approveRecommendation
import type { SkuAnalytics } from '../analytics/analytics';
import { ingestEvent } from '../engine/ingest';
import type { Alert, InventoryEvent, Recommendation, Task } from '../domain/types';
import { computeAnalytics, inventoryTotals, type DemoState } from '../store/demoState';
import { demoStore, type DemoStore } from '../store/demoStore';

export interface ApiResponse<T> { status: number; data: T | null; error: string | null }

const ok = <T>(data: T, status = 200): ApiResponse<T> => ({ status, data, error: null });
const fail = <T>(status: number, error: string): ApiResponse<T> => ({ status, data: null, error });

export interface InventoryRow {
  skuId: string;
  skuName: string;
  unitCost: number;
  stockBaseUnits: number;
  valueUsd: number;
  lots: { lotId: string; expiryDate: string | null }[];
  pallets: string[];
}

export function createDemoApi(store: DemoStore = demoStore) {
  return {
    getDemoState(): ApiResponse<DemoState> {
      return ok(store.getState());
    },
    resetDemo(): ApiResponse<DemoState> {
      return ok(store.dispatch({ type: 'RESET' }));
    },
    postEvent(event: InventoryEvent): ApiResponse<{ outcome: string; message: string }> {
      const result = ingestEvent(store.getState(), event);
      if (result.outcome === 'REJECTED') {
        store.dispatch({ type: 'POST_EVENT', event }); // registra el mensaje de error en el estado
        return fail(422, result.message);
      }
      store.dispatch({ type: 'POST_EVENT', event });
      return ok({ outcome: result.outcome, message: result.message }, result.outcome === 'APPLIED' ? 201 : 200);
    },
    getInventory(): ApiResponse<InventoryRow[]> {
      const s = store.getState();
      const totals = inventoryTotals(s);
      return ok(s.skus.map((sku) => {
        const lots = s.lots.filter((l) => l.skuId === sku.id);
        const lotIds = new Set(lots.map((l) => l.id));
        const stock = totals.get(sku.id) ?? 0;
        return {
          skuId: sku.id,
          skuName: sku.name,
          unitCost: sku.unitCost,
          stockBaseUnits: stock,
          valueUsd: stock * sku.unitCost,
          lots: lots.map((l) => ({ lotId: l.id, expiryDate: l.expiryDate })),
          pallets: s.units.filter((u) => u.type === 'PALLET' && u.lotId && lotIds.has(u.lotId)).map((u) => u.id),
        };
      }));
    },
    closeReceipt(purchaseOrderId: string, closedAt: string): ApiResponse<DemoState> {
      if (!store.getState().purchaseOrders.some((p) => p.id === purchaseOrderId)) return fail(404, `Orden de compra inexistente: ${purchaseOrderId}`);
      return ok(store.dispatch({ type: 'CLOSE_RECEIPT', purchaseOrderId, closedAt }));
    },
    getAlerts(): ApiResponse<Alert[]> {
      return ok(store.getState().alerts);
    },
    getAnalytics(): ApiResponse<SkuAnalytics[]> {
      return ok(computeAnalytics(store.getState()));
    },
    approveRecommendation(id: string): ApiResponse<{ recommendation: Recommendation; task: Task }> {
      const before = store.getState().recommendations.find((r) => r.id === id);
      if (!before) return fail(404, `Recomendación inexistente: ${id}`);
      if (before.status === 'REJECTED') return fail(409, `${id} fue rechazada`);
      const s = store.dispatch({ type: 'APPROVE_RECOMMENDATION', recommendationId: id });
      const recommendation = s.recommendations.find((r) => r.id === id)!;
      const task = s.tasks.find((t) => t.recommendationId === id)!;
      return ok({ recommendation, task }, before.status === 'PROPOSED' ? 201 : 200);
    },
  };
}

export type DemoApi = ReturnType<typeof createDemoApi>;
export const demoApi = createDemoApi();
