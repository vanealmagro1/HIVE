// Semáforo de antigüedad: colores, resumen, cajas con beacon y acciones contra el inventario hueso.
import { describe, expect, it } from 'vitest';
import { BEACON_BOXES } from '../seed/seed';
import { demoReducer } from '../store/demoReducer';
import { createInitialState } from '../store/demoState';
import { ageDays, agingBand, agingSummary, CRITICAL_DAYS, LOSS_RATE, skuAging } from './aging';

describe('semáforo de antigüedad', () => {
  it('asigna el color por días en bodega (0–90 verde, 91–180 ámbar, > 180 rojo)', () => {
    expect([0, 90, 91, 180, 181, 400].map((d) => agingBand(d).key)).toEqual(['verde', 'verde', 'ambar', 'ambar', 'rojo', 'rojo']);
    expect(ageDays({ receivedAt: '2026-11-09' }, '2026-11-19')).toBe(10);
    expect(ageDays({}, '2026-11-19')).toBeNull();
  });

  it('toda unidad raíz tiene fecha de ingreso y el resumen es determinista', () => {
    const s = createInitialState();
    expect(s.units.filter((u) => !u.parentId && !u.expectedLocationId.startsWith('REC-')).every((u) => u.receivedAt)).toBe(true);
    const a = agingSummary(s);
    const b = agingSummary(createInitialState());
    expect(a).toEqual(b);
    // La mayoría rota bien; una parte se estanca; unos pocos son hueso.
    const [verde, ambar, rojo] = a.bands;
    expect(verde.pct).toBeGreaterThan(0.5);
    expect(ambar.boxes).toBeGreaterThan(0);
    expect(rojo.boxes).toBeGreaterThan(0);
    expect(a.estimatedLossUsd).toBeCloseTo(rojo.valueUsd * LOSS_RATE, 6);
    expect(a.oldest[0].days).toBeGreaterThan(CRITICAL_DAYS);
  });

  it('las cajas con beacon muestran los tres colores al leerlas en vivo', () => {
    const s = createInitialState();
    const color = (id: string) => agingBand(ageDays(s.units.find((u) => u.id === id)!, s.referenceDate)!).key;
    expect(BEACON_BOXES.map((b) => [b.label, color(b.unitId)])).toEqual([['4', 'rojo'], ['7', 'verde'], ['5', 'ambar'], ['11', 'verde'], ['01', 'rojo']]);
  });
});

describe('acciones contra el inventario hueso', () => {
  it('propone mover, liquidar y despachar primero, sin duplicar las de sobrestock/vencimiento', () => {
    const s = createInitialState();
    const types = s.recommendations.map((r) => r.type);
    expect(types).toEqual(expect.arrayContaining(['MOVE_AGED', 'LIQUIDATE_AGED', 'PRIORITIZE_FIFO']));
    const ids = s.recommendations.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    // MOC-001 y TIN-001 ya tienen su recomendación del guion: el semáforo no agrega otra.
    expect(s.recommendations.filter((r) => r.skuId === 'MOC-001' || r.skuId === 'TIN-001').map((r) => r.type).sort())
      .toEqual(['PRIORITIZE_FEFO', 'REVIEW_EXCESS']);
    // Toda acción de antigüedad apunta a un producto realmente envejecido.
    const aging = new Map(skuAging(s).map((x) => [x.skuId, x]));
    for (const r of s.recommendations.filter((x) => x.type === 'MOVE_AGED' || x.type === 'LIQUIDATE_AGED')) {
      expect(aging.get(r.skuId!)!.band.key).toBe('rojo');
    }
  });

  it('aprobar "mover inventario hueso" prepara el traslado con pallets de más de 180 días', () => {
    const s0 = createInitialState();
    const rec = s0.recommendations.find((r) => r.type === 'MOVE_AGED')!;
    const s1 = demoReducer(s0, { type: 'APPROVE_RECOMMENDATION', recommendationId: rec.id });
    const m = s1.movements.find((x) => x.recommendationId === rec.id)!;
    expect(m).toMatchObject({ status: 'PLANNED', quantity: rec.quantity, skuId: rec.skuId, toWarehouseId: 'WH-QUITO-SUR' });
    for (const id of m.unitIds) expect(ageDays(s0.units.find((u) => u.id === id)!, s0.referenceDate)!).toBeGreaterThan(180);
    // Liquidar solo crea la tarea: no mueve inventario.
    const liq = s0.recommendations.find((r) => r.type === 'LIQUIDATE_AGED')!;
    const s2 = demoReducer(s0, { type: 'APPROVE_RECOMMENDATION', recommendationId: liq.id });
    expect(s2.tasks).toHaveLength(1);
    expect(s2.movements).toHaveLength(0);
  });
});
