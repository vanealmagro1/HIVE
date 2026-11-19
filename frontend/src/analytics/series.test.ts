import { describe, expect, it } from 'vitest';
import { demoReducer } from '../store/demoReducer';
import { computeAnalytics, createInitialState } from '../store/demoState';
import { getScenario, RECEIPT_CLOSE_TIME } from '../engine/scenarios';
import { DEMO_PO_ID } from '../seed/seed';
import { RECEIPT_SCENARIO_ID } from '../store/selectors';
import { demandSeries, PROJECTION_DAYS, stockSeries } from './series';

describe('Series de analítica (derivadas del estado)', () => {
  const s = createInitialState();

  it('demanda de mochilas: 30 días registrados que suman 300 u, proyección de 30 días a 10 u/día', () => {
    const d = demandSeries(s, 'MOC-001');
    expect(d.history).toHaveLength(30);
    expect(d.history.reduce((t, p) => t + p.units, 0)).toBe(300);
    expect(d.mean).toBe(10);
    expect(d.projection).toHaveLength(PROJECTION_DAYS);
    expect(d.projection[0].date).toBe('2026-11-19');
    expect(d.projection.every((p) => p.units === 10)).toBe(true);
    // Banda = ±1σ de la serie real (σ > 0 porque la demanda varía por día de la semana).
    expect(d.bandAvailable).toBe(true);
    expect(d.stdDev!).toBeGreaterThan(1);
    expect(d.projection[0].low).toBeCloseTo(10 - d.stdDev!, 6);
  });

  it('sin banda si la serie no varía (tinta: 4 u/día constantes) y sin proyección si faltan datos', () => {
    expect(demandSeries(s, 'TIN-001').bandAvailable).toBe(false);
    const cal = demandSeries(s, 'CAL-001');
    expect(cal.projection).toEqual([]);
    expect(cal.mean).toBeNull();
  });

  it('stock reconstruido: hoy = stock actual; incluye despachos y el traslado interno del 10/11', () => {
    const st = stockSeries(s, 'MOC-001');
    const today = st.history.at(-1)!;
    expect(today).toMatchObject({ date: '2026-11-19', stock: 600 });
    expect(st.history[0].stock).toBe(600 + 300 + 40 - (st.history[0].outflow + st.history[0].transferOut));
    expect(st.transfers.map((t) => t.date)).toEqual(['2026-11-10']);
    expect(st.targetStock).toBe(300);
    expect(st.projection[0].stock).toBe(600);
    expect(st.projection[30].stock).toBe(300);
  });

  it('las series coinciden con la analítica antes y después del traslado (misma fuente)', () => {
    let x = demoReducer(s, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-moc-001' });
    x = demoReducer(x, { type: 'START_MOVEMENT', movementId: 'mov-moc-001', at: '2026-11-19T10:25:00Z' });
    x = demoReducer(x, { type: 'CONFIRM_MOVEMENT', movementId: 'mov-moc-001', receivedQuantity: 300, at: '2026-11-19T11:05:00Z' });
    const a = computeAnalytics(x).find((k) => k.skuId === 'MOC-001')!;
    const st = stockSeries(x, 'MOC-001');
    expect(st.history.at(-1)!.stock).toBe(a.stock);
    expect(st.history.at(-1)!.transferOut).toBe(300);
    expect(st.history.at(-2)!.stock).toBe(600); // ayer seguían las 600 u
    expect(demandSeries(x, 'MOC-001').mean).toBe(10); // el traslado no es demanda
  });

  it('recepción: los lápices de colores suman la entrada del día cuando se cierra la OC', () => {
    expect(stockSeries(s, 'COL-001').history.at(-1)!.inflow).toBe(0);
    let x = s;
    for (const e of getScenario(RECEIPT_SCENARIO_ID).events) x = demoReducer(x, { type: 'POST_EVENT', event: e });
    x = demoReducer(x, { type: 'CLOSE_RECEIPT', purchaseOrderId: DEMO_PO_ID, closedAt: RECEIPT_CLOSE_TIME });
    const st = stockSeries(x, 'COL-001');
    const today = st.history.at(-1)!;
    expect(today.inflow).toBe(264); // 11 cajas leídas × 24 u
    expect(today.stock - st.history.at(-2)!.stock).toBe(264);
  });
});
