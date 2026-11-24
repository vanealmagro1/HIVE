// Recepción por portal RFID contra una orden de compra (aviso de envío con las etiquetas esperadas).
// Principios:
//  - Idempotencia por ID de evento (reenvío) y por EPC (el portal lee la misma etiqueta varias veces).
//  - El inventario solo suma las cajas cuya etiqueta se leyó; lo anunciado y no leído NO entra al stock.
//  - Cerrar la recepción compara lo leído con lo anunciado: un faltante crea discrepancia, alerta y una
//    recomendación de reclamo. No se ajusta nada contra el proveedor ni el ERP automáticamente.
import { formatNumber, formatUsd } from '../domain/format';
import type { Alert, Discrepancy, InventoryEvent, LogisticUnit, PurchaseOrder, Recommendation } from '../domain/types';
import { appendAudit, type DemoState } from '../store/demoState';
import type { ProcessResult } from './eventProcessor';

const reject = (state: DemoState, message: string): ProcessResult => ({
  state: { ...state, lastMessage: { kind: 'error', text: message } }, outcome: 'REJECTED', message,
});

export function processReceiptRead(state: DemoState, event: InventoryEvent): ProcessResult {
  if (state.events.some((e) => e.id === event.id)) {
    const message = `Evento ${event.id} ya procesado: reenvío ignorado (idempotente).`;
    return { state: { ...state, audit: appendAudit(state, message), lastMessage: { kind: 'warning', text: message } }, outcome: 'DUPLICATE', message };
  }
  const po = state.purchaseOrders.find((p) => p.id === event.purchaseOrderId);
  if (!po) return reject(state, `Orden de compra inexistente: ${String(event.purchaseOrderId)}`);
  if (po.status === 'CLOSED') return reject(state, `La recepción de ${po.id} ya está cerrada.`);
  if (!event.epc) return reject(state, 'La lectura requiere el código EPC de la etiqueta.');
  if (!event.capturedAt || !event.receivedAt) return reject(state, 'El evento requiere hora de captura y de recepción.');

  const asn = po.boxes.find((b) => b.epc === event.epc);
  let units = state.units;
  let nextPo: PurchaseOrder = { ...po, status: 'RECEIVING', readCount: po.readCount + 1 };
  let message: string;

  if (!asn) {
    message = `Etiqueta ${event.epc} no pertenece a ${po.id}: se registra la lectura, no entra al inventario.`;
  } else if (po.receivedBoxIds.includes(asn.boxId)) {
    message = `Lectura repetida de ${asn.boxId} (antena ${event.antenna ?? '?'}): se cuenta una sola vez.`;
  } else {
    const read = (u: Omit<LogisticUnit, 'observedLocationId' | 'verificationStatus' | 'lastObservedAt' | 'lastEventId'>): LogisticUnit => ({
      ...u, observedLocationId: po.dockLocationId, verificationStatus: 'OBSERVED', lastObservedAt: event.capturedAt, lastEventId: event.id,
    });
    const box = read({ id: asn.boxId, type: 'BOX', parentId: po.palletId, lotId: po.lotId, quantityBaseUnits: asn.qty, expectedLocationId: po.dockLocationId });
    const pallet = units.find((u) => u.id === po.palletId);
    units = pallet
      // El contenido declarado del pallet es la suma de las cajas efectivamente recibidas.
      ? units.map((u) => (u.id === po.palletId ? { ...u, quantityBaseUnits: u.quantityBaseUnits + asn.qty, lastObservedAt: event.capturedAt, lastEventId: event.id } : u))
      : [...units, read({ id: po.palletId, type: 'PALLET', parentId: null, lotId: po.lotId, quantityBaseUnits: asn.qty, expectedLocationId: po.dockLocationId })];
    units = [...units, box];
    nextPo = { ...nextPo, receivedBoxIds: [...po.receivedBoxIds, asn.boxId] };
    message = `Caja ${asn.boxId} recibida por el portal (${nextPo.receivedBoxIds.length} de ${po.boxes.length}).`;
  }

  const next: DemoState = {
    ...state,
    units,
    purchaseOrders: state.purchaseOrders.map((p) => (p.id === po.id ? nextPo : p)),
    events: [...state.events, event],
    audit: appendAudit(state, `[${event.source} · ${event.channel ?? 'RFID'}] ${message}`),
    lastMessage: { kind: asn ? 'info' : 'warning', text: message },
  };
  return { state: next, outcome: 'APPLIED', message };
}

/** Valor de lo anunciado y no leído en una orden de compra. */
export function receiptShortage(state: Pick<DemoState, 'skus'>, po: PurchaseOrder) {
  const missing = po.boxes.filter((b) => !po.receivedBoxIds.includes(b.boxId));
  const units = missing.reduce((s, b) => s + b.qty, 0);
  const cost = state.skus.find((s) => s.id === po.skuId)?.unitCost ?? 0;
  return { missing, units, usd: Math.round(units * cost * 100) / 100 };
}

export function closeReceipt(state: DemoState, poId: string, closedAt: string): DemoState {
  const po = state.purchaseOrders.find((p) => p.id === poId);
  if (!po) return { ...state, lastMessage: { kind: 'error', text: `Orden de compra inexistente: ${poId}` } };
  if (po.status === 'CLOSED') return { ...state, lastMessage: { kind: 'warning', text: `La recepción de ${po.id} ya estaba cerrada.` } };

  const { missing, units, usd } = receiptShortage(state, po);
  const closed: PurchaseOrder = { ...po, status: 'CLOSED', closedAt };
  let discrepancies = state.discrepancies;
  let alerts = state.alerts;
  let recommendations = state.recommendations;
  const received = po.receivedBoxIds.length;
  let message = `Recepción de ${po.id} cerrada: ${received} de ${po.boxes.length} cajas leídas por el portal RFID.`;

  if (missing.length > 0) {
    const suffix = po.id.toLowerCase();
    const description = `${po.id}: el portal leyó ${received} de ${po.boxes.length} cajas. Faltan ${missing.length} `
      + `(${formatNumber(units)} u · ${formatUsd(usd)}); pendiente de verificación con el transportista.`;
    const evidence = state.events.filter((e) => e.purchaseOrderId === po.id).map((e) => e.id);
    const disc: Discrepancy = {
      id: `disc-${suffix}`, kind: 'RECEIPT_SHORTAGE', unitId: po.palletId, expectedLocationId: po.dockLocationId,
      observedLocationId: po.dockLocationId, status: 'PENDING_VERIFICATION', description, evidenceEventIds: evidence,
    };
    const alert: Alert = {
      id: `alert-${suffix}`, type: 'RECEIPT_SHORTAGE', priority: 'HIGH', status: 'NEW', unitId: po.palletId,
      description, evidenceEventIds: evidence, createdAt: closedAt,
    };
    const rec: Recommendation = {
      id: `rec-claim-${suffix}`,
      type: 'CLAIM_SHORTAGE',
      title: 'Reclamar faltante al proveedor',
      reason: `${po.supplier} facturará ${po.boxes.length} cajas, pero solo se leyeron ${received}. Faltan ${missing.map((m) => m.boxId).join(', ')}.`,
      skuId: po.skuId,
      unitId: po.palletId,
      estimatedImpactUsd: usd,
      status: 'PROPOSED',
      assumptions: [
        'Una caja sin lectura puede tener la etiqueta dañada o tapada: confirmar con un conteo manual antes de reclamar.',
        `Valor a costo: ${formatNumber(units)} u × costo unitario del producto.`,
        'Aprobar crea una tarea; no emite nota de crédito ni modifica el ERP.',
      ],
    };
    discrepancies = [...discrepancies, disc];
    alerts = [...alerts, alert];
    recommendations = [...recommendations, rec];
    message += ` Faltan ${missing.length} (${formatNumber(units)} u · ${formatUsd(usd)}).`;
  }

  return {
    ...state,
    purchaseOrders: state.purchaseOrders.map((p) => (p.id === po.id ? closed : p)),
    discrepancies,
    alerts,
    recommendations,
    audit: appendAudit(state, message),
    lastMessage: { kind: missing.length ? 'warning' : 'info', text: message },
  };
}
