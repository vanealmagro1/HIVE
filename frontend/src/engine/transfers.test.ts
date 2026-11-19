import { describe, expect, it } from 'vitest';
import { stockBySku } from '../domain/inventory';
import { demoReducer } from '../store/demoReducer';
import { computeAnalytics, createInitialState, type DemoState } from '../store/demoState';
import { availablePallets, planTransfer, transferComparison, transferCandidates } from './transfers';
import { getScenario } from './scenarios';

const REC = 'rec-moc-001';
const MOV = 'mov-moc-001';
const AT = { start: '2026-11-19T10:25:00Z', end: '2026-11-19T11:05:00Z' };
const moc = (s: DemoState) => stockBySku(s.units, s.lots).get('MOC-001') ?? 0;
const sur = (s: DemoState) => s.remoteSites[0].stockBySku['MOC-001'];
const approve = (s: DemoState) => demoReducer(s, { type: 'APPROVE_RECOMMENDATION', recommendationId: REC });
const start = (s: DemoState) => demoReducer(s, { type: 'START_MOVEMENT', movementId: MOV, at: AT.start });
const confirm = (s: DemoState, qty = 300) => demoReducer(s, { type: 'CONFIRM_MOVEMENT', movementId: MOV, receivedQuantity: qty, at: AT.end });

describe('Traslado interno simulado (aprobar → simular → confirmar)', () => {
  it('destino válido: Quito Sur tiene déficit de 300 u para su cobertura de 30 días', () => {
    const [c] = transferCandidates(createInitialState(), 'MOC-001');
    expect(c.site.name).toMatch(/Quito Sur/);
    expect(c.stock).toBe(90);
    expect(c.deficit).toBe(300);
  });

  it('aprobar crea UNA tarea y un movimiento PLANNED; no cambia el inventario', () => {
    const s0 = createInitialState();
    const s1 = approve(s0);
    const s2 = approve(s1); // doble clic
    expect(s2.tasks).toHaveLength(1);
    expect(s2.tasks[0]).toMatchObject({ status: 'OPEN', skuId: 'MOC-001', quantity: 300, owner: expect.any(String), createdAt: expect.any(String) });
    expect(s2.movements).toHaveLength(1);
    expect(s2.movements[0]).toMatchObject({ id: MOV, status: 'PLANNED', quantity: 300, unitIds: ['PAL-004', 'PAL-003'], originLocationIds: ['B-09-01', 'B-08-01'] });
    expect(moc(s2)).toBe(600);
  });

  it('no elige pallets con discrepancia abierta (PAL-001 por verificar)', () => {
    let s = createInitialState();
    for (const e of getScenario('DEMO_COUNT_P4').events) s = demoReducer(s, { type: 'POST_EVENT', event: e });
    expect(availablePallets(s, 'MOC-001').map((u) => u.id)).not.toContain('PAL-001');
    const plan = planTransfer(s, 'MOC-001', 300);
    expect(plan.ok && plan.unitIds).toEqual(['PAL-004', 'PAL-003']);
  });

  it('rechaza cantidades que el destino no necesita o que no forman pallets completos', () => {
    const s = createInitialState();
    expect(planTransfer(s, 'MOC-001', 450).ok).toBe(false);
    expect(planTransfer(s, 'MOC-001', 100).ok).toBe(false);
    expect(planTransfer(s, 'TIN-001', 60).ok).toBe(false); // sin bodega destino con demanda
  });

  it('no se ejecuta sin aprobación ni se confirma sin ejecutar', () => {
    const s0 = createInitialState();
    expect(start(s0).movements).toEqual([]);
    const s1 = approve(s0);
    const c = confirm(s1);
    expect(c.movements[0].status).toBe('PLANNED');
    expect(c.lastMessage?.kind).toBe('error');
  });

  it('simular pone En ejecución sin mover stock; confirmar mueve 300 u y conserva el total (690)', () => {
    const s1 = start(approve(createInitialState()));
    expect(s1.movements[0].status).toBe('IN_PROGRESS');
    expect(s1.tasks[0].status).toBe('IN_PROGRESS');
    expect(moc(s1) + sur(s1)).toBe(690);
    expect(moc(s1)).toBe(600);
    expect(start(s1).movements).toEqual(s1.movements); // repetir no duplica

    const s2 = confirm(s1);
    expect(s2.movements[0]).toMatchObject({ status: 'COMPLETED', receivedQuantity: 300, before: { originStock: 600, destinationStock: 90 }, after: { originStock: 300, destinationStock: 390 } });
    expect(s2.tasks[0].status).toBe('DONE');
    expect(moc(s2)).toBe(300);
    expect(sur(s2)).toBe(390);
    expect(moc(s2) + sur(s2)).toBe(690);
    expect(s2.units.some((u) => u.id === 'PAL-004' || u.parentId === 'PAL-004')).toBe(false);
    expect(s2.movements[0].shippedUnits).toHaveLength(14); // 2 pallets + 12 cajas (trazabilidad)

    const s3 = confirm(s2); // doble confirmación
    expect(sur(s3)).toBe(390);
    expect(s3.internalTransfers).toHaveLength(s2.internalTransfers.length);
  });

  it('la cantidad recibida debe coincidir con la enviada', () => {
    const s1 = start(approve(createInitialState()));
    const bad = confirm(s1, 275);
    expect(bad.movements[0].status).toBe('IN_PROGRESS');
    expect(moc(bad)).toBe(600);
    expect(bad.lastMessage?.kind).toBe('error');
  });

  it('el traslado es interno: la demanda no cambia y la analítica se recalcula', () => {
    const s0 = createInitialState();
    const s2 = confirm(start(approve(s0)));
    const a0 = computeAnalytics(s0).find((a) => a.skuId === 'MOC-001')!;
    const a2 = computeAnalytics(s2).find((a) => a.skuId === 'MOC-001')!;
    expect(a2.dailyDemand).toBe(a0.dailyDemand);
    expect(a2.coverageDays).toBe(30);
    expect(a2.excessExposureUsd).toBe(0);
    const c = transferComparison(s2, s2.movements[0]);
    expect([c.origin.before.exposureUsd, c.origin.after.exposureUsd]).toEqual([2400, 0]);
    expect(c.destination.after.coverageDays).toBe(30);
    expect([c.totalBefore, c.totalAfter, c.confirmed]).toEqual([690, 690, true]);
  });

  it('reiniciar vuelve al estado semilla', () => {
    const s = demoReducer(confirm(start(approve(createInitialState()))), { type: 'RESET' });
    expect(s.movements).toEqual([]);
    expect(sur(s)).toBe(90);
    expect(moc(s)).toBe(600);
  });
});
