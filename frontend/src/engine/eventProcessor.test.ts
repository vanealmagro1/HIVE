import { describe, expect, it } from 'vitest';
import { createInitialState, computeAnalytics, inventoryTotals } from '../store/demoState';
import { demoReducer } from '../store/demoReducer';
import { createDemoStore } from '../store/demoStore';
import { createDemoApi } from '../api/demoApi';
import { getScenario } from './scenarios';
import { processEvent } from './eventProcessor';

const moveEvent = getScenario('DEMO_MOVE_001').events[0];
const missedEvent = getScenario('DEMO_MISSING_001').events[0];

describe('evento evt-demo-001 (PAL-001 observado en LOC-B2)', () => {
  const s0 = createInitialState();
  const { state: s1, outcome } = processEvent(s0, moveEvent);
  const pal = s1.units.find((u) => u.id === 'PAL-001')!;

  it('se aplica con fuente SIMULATED', () => {
    expect(outcome).toBe('APPLIED');
    expect(s1.events).toHaveLength(1);
    expect(s1.events[0]).toMatchObject({ id: 'evt-demo-001', source: 'SIMULATED', unitId: 'PAL-001', locationHintId: 'LOC-B2' });
  });

  it('registra la observación sin mutar la ubicación esperada', () => {
    expect(pal.expectedLocationId).toBe('LOC-A1');
    expect(pal.observedLocationId).toBe('LOC-B2');
    expect(pal.verificationStatus).toBe('PENDING_VERIFICATION');
    expect(pal.verificationStatus).not.toBe('CONFIRMED');
    expect(pal.lastObservedAt).toBe('2026-11-19T09:15:00Z');
  });

  it('crea exactamente una discrepancia pendiente y una alerta HIGH NEW con evidencia', () => {
    expect(s1.discrepancies).toHaveLength(1);
    expect(s1.discrepancies[0]).toMatchObject({
      id: 'disc-demo-001', kind: 'LOCATION_MISMATCH', status: 'PENDING_VERIFICATION',
      expectedLocationId: 'LOC-A1', observedLocationId: 'LOC-B2', evidenceEventIds: ['evt-demo-001'],
    });
    expect(s1.discrepancies[0].description).toContain('pendiente de verificación');
    expect(s1.alerts).toHaveLength(1);
    expect(s1.alerts[0]).toMatchObject({ id: 'alert-demo-001', priority: 'HIGH', status: 'NEW', unitId: 'PAL-001', evidenceEventIds: ['evt-demo-001'] });
  });

  it('no altera stock ni las cajas hijas (lectura de pallet no verifica cajas)', () => {
    expect(inventoryTotals(s1)).toEqual(inventoryTotals(s0));
    for (const id of ['BOX-001-1', 'BOX-001-2']) {
      expect(s1.units.find((u) => u.id === id)).toEqual(s0.units.find((u) => u.id === id));
    }
  });

  it('propone verificar la ubicación', () => {
    const rec = s1.recommendations.find((r) => r.id === 'rec-verify-pal-001');
    expect(rec?.status).toBe('PROPOSED');
    expect(rec?.type).toBe('VERIFY_LOCATION');
  });

  it('reenviar el MISMO ID es idempotente: no duplica evento, discrepancia, alerta ni recomendación', () => {
    const r2 = processEvent(s1, moveEvent);
    expect(r2.outcome).toBe('DUPLICATE');
    expect(r2.state.events).toHaveLength(1);
    expect(r2.state.discrepancies).toHaveLength(1);
    expect(r2.state.alerts).toHaveLength(1);
    expect(r2.state.recommendations).toHaveLength(s1.recommendations.length);
    expect(r2.state.units).toEqual(s1.units);
    // también vía escenario repetido
    const s3 = demoReducer(demoReducer(s0, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_MOVE_001' }), { type: 'RUN_SCENARIO', scenarioId: 'DEMO_MOVE_001' });
    expect(s3.events).toHaveLength(1);
    expect(s3.alerts).toHaveLength(1);
  });

  it('un nuevo evento sobre la misma discrepancia abierta agrega evidencia sin duplicar alerta', () => {
    const second = { ...moveEvent, id: 'evt-demo-001b', capturedAt: '2026-11-19T09:16:00Z', receivedAt: '2026-11-19T09:16:01Z' };
    const r = processEvent(s1, second);
    expect(r.state.events).toHaveLength(2);
    expect(r.state.alerts).toHaveLength(1);
    expect(r.state.alerts[0].evidenceEventIds).toEqual(['evt-demo-001', 'evt-demo-001b']);
  });
});

describe('ausencia de lectura', () => {
  it('crea estado pendiente y alerta MEDIUM, nunca pérdida confirmada ni cambio de stock', () => {
    const s0 = createInitialState();
    const { state } = processEvent(s0, missedEvent);
    const pal = state.units.find((u) => u.id === 'PAL-007')!;
    expect(pal.verificationStatus).toBe('PENDING_VERIFICATION');
    expect(pal.expectedLocationId).toBe('LOC-C1');
    expect(pal.observedLocationId).toBeNull();
    expect(state.discrepancies[0]).toMatchObject({ kind: 'NOT_OBSERVED', status: 'PENDING_VERIFICATION' });
    expect(state.alerts[0].priority).toBe('MEDIUM');
    expect(state.alerts[0].description).toContain('No implica pérdida confirmada');
    expect(inventoryTotals(state)).toEqual(inventoryTotals(s0));
    expect(state.units).toHaveLength(s0.units.length);
  });
});

describe('validación de eventos', () => {
  const s0 = createInitialState();
  it('rechaza unidad o ubicación inexistentes sin modificar el estado de dominio', () => {
    for (const bad of [{ ...moveEvent, id: 'evt-x1', unitId: 'PAL-999' }, { ...moveEvent, id: 'evt-x2', locationHintId: 'LOC-Z9' }, { ...moveEvent, id: '' }]) {
      const r = processEvent(s0, bad);
      expect(r.outcome).toBe('REJECTED');
      expect(r.state.events).toEqual([]);
      expect(r.state.alerts).toEqual([]);
    }
  });
  it('una observación coherente marca OBSERVED sin discrepancia', () => {
    const r = processEvent(s0, { ...moveEvent, id: 'evt-ok', locationHintId: 'LOC-A1' });
    expect(r.state.units.find((u) => u.id === 'PAL-001')!.verificationStatus).toBe('OBSERVED');
    expect(r.state.discrepancies).toEqual([]);
    expect(r.state.alerts).toEqual([]);
  });
});

describe('recomendaciones y tareas', () => {
  it('existe rec-sku-a PROPOSED con impacto USD 2400 y rec-sku-b USD 720; SKU-C sin recomendación', () => {
    const s = createInitialState();
    expect(s.recommendations.find((r) => r.id === 'rec-sku-a')).toMatchObject({ status: 'PROPOSED', estimatedImpactUsd: 2400, title: 'Revisar stock y evaluar redistribución' });
    expect(s.recommendations.find((r) => r.id === 'rec-sku-b')).toMatchObject({ type: 'PRIORITIZE_FEFO', estimatedImpactUsd: 720 });
    expect(s.recommendations.some((r) => r.skuId === 'SKU-C')).toBe(false);
  });

  it('aprobar crea exactamente una tarea task-rec-sku-a; repetir no duplica; stock y ubicaciones intactos', () => {
    const s0 = createInitialState();
    const s1 = demoReducer(s0, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-sku-a' });
    const s2 = demoReducer(s1, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-sku-a' });
    expect(s2.recommendations.find((r) => r.id === 'rec-sku-a')!.status).toBe('APPROVED');
    expect(s2.tasks).toHaveLength(1);
    expect(s2.tasks[0]).toMatchObject({ id: 'task-rec-sku-a', recommendationId: 'rec-sku-a', status: 'OPEN' });
    expect(s2.units).toEqual(s0.units);
    expect(computeAnalytics(s2)).toEqual(computeAnalytics(s0));
  });

  it('rechazar no crea tarea y bloquea una aprobación posterior', () => {
    const s1 = demoReducer(createInitialState(), { type: 'REJECT_RECOMMENDATION', recommendationId: 'rec-sku-b' });
    const s2 = demoReducer(s1, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-sku-b' });
    expect(s2.recommendations.find((r) => r.id === 'rec-sku-b')!.status).toBe('REJECTED');
    expect(s2.tasks).toEqual([]);
  });
});

describe('reset', () => {
  it('después del flujo completo, RESET devuelve exactamente el estado semilla (datos y predicciones)', () => {
    const initial = createInitialState();
    let s = demoReducer(initial, { type: 'SELECT_UNIT', unitId: 'PAL-001' });
    s = demoReducer(s, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_MOVE_001' });
    s = demoReducer(s, { type: 'SET_ALERT_STATUS', alertId: 'alert-demo-001', status: 'IN_REVIEW' });
    s = demoReducer(s, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-sku-a' });
    s = demoReducer(s, { type: 'SET_VIEW', view: 'analytics' });
    const r = demoReducer(s, { type: 'RESET' });
    const { lastMessage, ...rest } = r;
    const { lastMessage: _ignored, ...restInitial } = initial;
    expect(rest).toEqual(restInitial);
    expect(lastMessage?.text).toContain('reiniciada');
    expect(computeAnalytics(r)).toEqual(computeAnalytics(initial));
    // y el flujo se puede repetir
    const again = demoReducer(r, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_MOVE_001' });
    expect(again.alerts).toHaveLength(1);
  });
});

describe('contrato demoApi (equivalente a la API, en memoria)', () => {
  it('postEvent devuelve 201 y luego 200 DUPLICATE; 422 si es inválido; approve 201/200/404', () => {
    const api = createDemoApi(createDemoStore());
    expect(api.postEvent(moveEvent).status).toBe(201);
    const dup = api.postEvent(moveEvent);
    expect(dup.status).toBe(200);
    expect(dup.data?.outcome).toBe('DUPLICATE');
    expect(api.postEvent({ ...moveEvent, id: 'evt-bad', unitId: 'NOPE' }).status).toBe(422);
    expect(api.getAlerts().data).toHaveLength(1);
    expect(api.approveRecommendation('rec-sku-a').status).toBe(201);
    expect(api.approveRecommendation('rec-sku-a').status).toBe(200);
    expect(api.approveRecommendation('rec-nope').status).toBe(404);
    expect(api.getDemoState().data?.tasks).toHaveLength(1);
    const inv = api.getInventory().data!;
    expect(inv.find((r) => r.skuId === 'SKU-A')).toMatchObject({ stockBaseUnits: 600, valueUsd: 4800 });
    expect(api.getAnalytics().data!.find((a) => a.skuId === 'SKU-A')!.excessExposureUsd).toBe(2400);
    api.resetDemo();
    expect(api.getAlerts().data).toEqual([]);
    expect(api.getDemoState().data?.tasks).toEqual([]);
  });
});
