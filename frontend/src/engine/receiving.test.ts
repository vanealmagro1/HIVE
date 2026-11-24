import { describe, expect, it, vi } from 'vitest';
import { createInitialState, inventoryTotals } from '../store/demoState';
import { demoReducer } from '../store/demoReducer';
import { createDemoStore } from '../store/demoStore';
import { hierarchyIssues } from '../domain/inventory';
import { SimulatedRfidSource } from '../ingest/readSource';
import { getScenario, RECEIPT_CLOSE_TIME } from './scenarios';
import { ingestEvent } from './ingest';
import { createActions } from '../components/actions';

const reads = getScenario('DEMO_RECEIPT_001').events;
const receiveAll = () => reads.reduce((s, e) => ingestEvent(s, e).state, createInitialState());

describe('recepción RFID de la OC-2026-1187 (portal del andén, simulado)', () => {
  it('el escenario trae 14 lecturas de 11 etiquetas distintas (3 repetidas por la antena 2)', () => {
    expect(reads).toHaveLength(14);
    expect(new Set(reads.map((e) => e.epc)).size).toBe(11);
    expect(reads.every((e) => e.channel === 'RFID_PORTAL' && e.source === 'SIMULATED')).toBe(true);
  });

  it('cada etiqueta nueva crea su caja en el andén; las repetidas se cuentan una sola vez', () => {
    const s0 = createInitialState();
    const s = receiveAll();
    const po = s.purchaseOrders[0];
    expect(po.status).toBe('RECEIVING');
    expect(po.receivedBoxIds).toHaveLength(11);
    expect(po.readCount).toBe(14);
    expect(s.units.filter((u) => u.parentId === 'PAL-901')).toHaveLength(11);
    expect(s.units.find((u) => u.id === 'PAL-901')!.quantityBaseUnits).toBe(264);
    expect(inventoryTotals(s).get('COL-001')).toBe(264);
    expect(inventoryTotals(s0).get('COL-001') ?? 0).toBe(0);
    expect(hierarchyIssues(s.units)).toEqual([]);
  });

  it('reenviar una lectura con el mismo ID es idempotente', () => {
    const s = receiveAll();
    const r = ingestEvent(s, reads[0]);
    expect(r.outcome).toBe('DUPLICATE');
    expect(r.state.units).toEqual(s.units);
    expect(r.state.purchaseOrders).toEqual(s.purchaseOrders);
  });

  it('cerrar detecta el faltante: 1 caja · 24 u · USD 86,40 → discrepancia, alerta ALTA y reclamo propuesto', () => {
    const s = demoReducer(receiveAll(), { type: 'CLOSE_RECEIPT', purchaseOrderId: 'OC-2026-1187', closedAt: RECEIPT_CLOSE_TIME });
    expect(s.purchaseOrders[0].status).toBe('CLOSED');
    expect(s.discrepancies).toEqual([expect.objectContaining({ id: 'disc-oc-2026-1187', kind: 'RECEIPT_SHORTAGE', status: 'PENDING_VERIFICATION' })]);
    expect(s.alerts).toEqual([expect.objectContaining({ id: 'alert-oc-2026-1187', priority: 'HIGH', type: 'RECEIPT_SHORTAGE' })]);
    expect(s.recommendations.find((r) => r.id === 'rec-claim-oc-2026-1187')).toMatchObject({ type: 'CLAIM_SHORTAGE', estimatedImpactUsd: 86.4, status: 'PROPOSED' });
    expect(s.units.some((u) => u.id === 'BOX-901-12')).toBe(false); // lo no leído no entra al inventario
    // cerrar de nuevo no duplica
    const again = demoReducer(s, { type: 'CLOSE_RECEIPT', purchaseOrderId: 'OC-2026-1187', closedAt: RECEIPT_CLOSE_TIME });
    expect(again.alerts).toHaveLength(1);
    // tras cerrar, nuevas lecturas se rechazan
    expect(ingestEvent(s, { ...reads[0], id: 'evt-late' }).outcome).toBe('REJECTED');
  });

  it('una etiqueta ajena a la OC se registra pero no entra al inventario', () => {
    const r = ingestEvent(createInitialState(), { ...reads[0], id: 'evt-foreign', epc: 'E2000000000000000000BEEF' });
    expect(r.outcome).toBe('APPLIED');
    expect(r.state.units).toHaveLength(createInitialState().units.length);
  });
});

describe('fuente simulada y acciones de la UI', () => {
  it('SimulatedRfidSource emite en orden, termina y se puede detener', () => {
    vi.useFakeTimers();
    const got: string[] = [];
    let done = false;
    const src = new SimulatedRfidSource('t', reads.slice(0, 3), 100);
    src.start((e) => got.push(e.id), () => { done = true; });
    vi.advanceTimersByTime(250);
    expect(got).toEqual(reads.slice(0, 2).map((e) => e.id));
    vi.advanceTimersByTime(500);
    expect(got).toHaveLength(3);
    expect(done).toBe(true);
    const src2 = new SimulatedRfidSource('t2', reads, 100);
    src2.start((e) => got.push(e.id));
    src2.stop();
    vi.advanceTimersByTime(5000);
    expect(got).toHaveLength(3);
    vi.useRealTimers();
  });

  it('startReception reproduce y cierra solo; reset durante la reproducción la detiene', () => {
    vi.useFakeTimers();
    const store = createDemoStore();
    const actions = createActions(store);
    actions.startReception();
    expect(store.getState().ui.playback).toBe('DEMO_RECEIPT_001');
    vi.advanceTimersByTime(60_000);
    expect(store.getState().purchaseOrders[0].status).toBe('CLOSED');
    expect(store.getState().ui.playback).toBeNull();

    actions.reset();
    actions.startReception();
    vi.advanceTimersByTime(1000);
    actions.reset();
    vi.advanceTimersByTime(60_000);
    expect(store.getState().events).toEqual([]);
    expect(store.getState().purchaseOrders[0].status).toBe('EXPECTED');
    vi.useRealTimers();
  });

  it('completeReception (plan B) da el mismo resultado que la reproducción', () => {
    const store = createDemoStore();
    createActions(store).completeReception();
    const s = store.getState();
    expect(s.purchaseOrders[0]).toMatchObject({ status: 'CLOSED', readCount: 14 });
    expect(s.alerts.map((a) => a.id)).toEqual(['alert-oc-2026-1187']);
  });
});
