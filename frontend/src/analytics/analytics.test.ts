import { describe, expect, it } from 'vitest';
import { computeSkuAnalytics } from './analytics';
import { createSeed } from '../seed/seed';
import { stockByLot } from '../domain/inventory';
import { REFERENCE_DATE } from '../domain/constants';
import { addDays } from '../domain/dates';
import type { DailyDemand, SKU } from '../domain/types';

function analyticsFor(skuId: string) {
  const seed = createSeed();
  return computeSkuAnalytics({
    sku: seed.skus.find((s) => s.id === skuId)!,
    lots: seed.lots,
    stockByLot: stockByLot(seed.units),
    demand: seed.dailyDemand,
    targetCoverageDays: 30,
    referenceDate: REFERENCE_DATE,
  });
}

/** n días consecutivos previos a la fecha de referencia con `qty` despachos/día. */
function demandSeries(skuId: string, days: number, qty: number): DailyDemand[] {
  return Array.from({ length: days }, (_, i) => ({ skuId, date: addDays(REFERENCE_DATE, -(i + 1)), dispatchedBaseUnits: qty }));
}

describe('analítica MOC-001 (sobrestock)', () => {
  const a = analyticsFor('MOC-001');
  it('600 u / 10 u/día = 60 días; exceso 300 u; exposición USD 2400', () => {
    expect(a.stock).toBe(600);
    expect(a.dispatchedInWindow).toBe(300);
    expect(a.dailyDemand).toBe(10);
    expect(a.coverageDays).toBe(60);
    expect(a.excessUnits).toBe(300);
    expect(a.excessExposureUsd).toBe(2400);
    expect(a.dataCoverage).toBe('ALTA');
  });
  it('no muestra riesgo de vencimiento para un SKU sin caducidad', () => {
    expect(a.expiryRisks).toEqual([]);
    expect(a.expiryExposureUsd).toBeNull();
    expect(a.stagnantByRule).toBe(false);
  });
});

describe('analítica TIN-001 (vencimiento)', () => {
  const b = analyticsFor('TIN-001');
  it('120 u, 4 u/día, vence en 15 días -> 60 u remanentes y USD 720', () => {
    expect(b.stock).toBe(120);
    expect(b.dailyDemand).toBe(4);
    expect(b.expiryRisks).toHaveLength(1);
    expect(b.expiryRisks[0].daysUntilExpiry).toBe(15);
    expect(b.expiryRemainingUnits).toBe(60);
    expect(b.expiryExposureUsd).toBe(720);
    expect(b.excessUnits).toBe(0); // cobertura 30 días = objetivo
  });
});

describe('analítica CAL-001 (sin datos suficientes)', () => {
  const c = analyticsFor('CAL-001');
  it('no inventa pronóstico ni riesgo de vencimiento', () => {
    expect(c.forecastAvailable).toBe(false);
    expect(c.insufficientDataMessage).toBe('Sin datos suficientes para pronosticar');
    expect(c.dailyDemand).toBeNull();
    expect(c.coverageDays).toBeNull();
    expect(c.excessUnits).toBeNull();
    expect(c.expiryRisks).toEqual([]);
  });
  it('marca inmovilizado por REGLA (>60 días sin despacho)', () => {
    expect(c.daysSinceLastDispatch).toBe(96);
    expect(c.stagnantByRule).toBe(true);
    expect(c.stagnantValueUsd).toBe(1000);
  });
});

describe('casos borde', () => {
  const sku: SKU = { id: 'X', name: 'X', unitCost: 3, hasExpiry: true };
  const lots = [{ id: 'LX', skuId: 'X', expiryDate: '2026-11-25' }];

  it('stock=0 y consumo=0 no divide por cero', () => {
    const r = computeSkuAnalytics({ sku, lots, stockByLot: new Map(), demand: [], targetCoverageDays: 30, referenceDate: REFERENCE_DATE });
    expect(r.stock).toBe(0);
    expect(r.coverageDays).toBeNull();
    expect(r.expiryRisks).toEqual([]);
    expect(r.stagnantByRule).toBe(false);
  });

  it('stock=0 con demanda: cobertura 0, sin exceso ni remanente', () => {
    const r = computeSkuAnalytics({ sku, lots, stockByLot: new Map([['LX', 0]]), demand: demandSeries('X', 30, 1), targetCoverageDays: 30, referenceDate: REFERENCE_DATE });
    expect(r.coverageDays).toBe(0);
    expect(r.excessUnits).toBe(0);
    expect(r.expiryRemainingUnits).toBe(0);
  });

  it('los despachos fuera de la ventana o en la fecha de referencia no cuentan', () => {
    const demand: DailyDemand[] = [
      ...demandSeries('X', 10, 3),
      { skuId: 'X', date: REFERENCE_DATE, dispatchedBaseUnits: 500 },
      { skuId: 'X', date: addDays(REFERENCE_DATE, -31), dispatchedBaseUnits: 500 },
    ];
    const r = computeSkuAnalytics({ sku, lots, stockByLot: new Map([['LX', 10]]), demand, targetCoverageDays: 30, referenceDate: REFERENCE_DATE });
    expect(r.dispatchedInWindow).toBe(30);
    expect(r.dailyDemand).toBe(1);
  });

  it('FEFO: el consumo se asigna primero al lote que vence antes', () => {
    const lots2 = [
      { id: 'L1', skuId: 'X', expiryDate: addDays(REFERENCE_DATE, 10) },
      { id: 'L2', skuId: 'X', expiryDate: addDays(REFERENCE_DATE, 20) },
    ];
    // 30 días × 2 u = 60 / 30 = 2 u/día
    const r = computeSkuAnalytics({ sku, lots: lots2, stockByLot: new Map([['L1', 30], ['L2', 30]]), demand: demandSeries('X', 30, 2), targetCoverageDays: 30, referenceDate: REFERENCE_DATE });
    expect(r.dailyDemand).toBe(2);
    // L1: 20 consumibles en 10 días -> quedan 10. L2: 40 consumibles en 20 días, 20 ya fueron a L1 -> quedan 10.
    expect(r.expiryRisks.map((x) => x.remainingAtExpiry)).toEqual([10, 10]);
    expect(r.expiryExposureUsd).toBe(60);
  });

  it('pocos días con despachos -> sin pronóstico', () => {
    const r = computeSkuAnalytics({ sku, lots, stockByLot: new Map([['LX', 10]]), demand: demandSeries('X', 3, 5), targetCoverageDays: 30, referenceDate: REFERENCE_DATE });
    expect(r.forecastAvailable).toBe(false);
    expect(r.dataCoverage).toBe('INSUFICIENTE');
  });

  it('sin caducidad no genera riesgo FEFO aunque haya demanda', () => {
    const r = computeSkuAnalytics({ sku: { ...sku, hasExpiry: false }, lots, stockByLot: new Map([['LX', 10]]), demand: demandSeries('X', 30, 1), targetCoverageDays: 30, referenceDate: REFERENCE_DATE });
    expect(r.forecastAvailable).toBe(true);
    expect(r.expiryRisks).toEqual([]);
  });
});
