import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../store/demoState';
import { demoReducer } from '../../store/demoReducer';
import { demoSteps } from '../../store/selectors';
import { AISLE_W, FRONT_Z, PORTAL_Z, RACK_DEPTH, STORAGE_Z, aisleLayouts, locationPositions, rackLayouts } from './layout';

describe('layout del gemelo (derivado del estado)', () => {
  const s = createInitialState();
  const pos = locationPositions(s.zones, s.racks, s.locations);

  it('cada ubicación tiene una posición única', () => {
    expect(pos.size).toBe(s.locations.length);
    expect(new Set([...pos.values()].map((p) => p.join(','))).size).toBe(s.locations.length);
  });

  it('niveles más altos se dibujan más arriba', () => {
    expect(pos.get('B-03-03')![1]).toBeGreaterThan(pos.get('B-03-01')![1]);
  });

  it('pasillos paralelos: racks a ambos lados sin solaparse y con pasillo libre entre ellos', () => {
    const racks = rackLayouts(s.zones, s.racks).filter((r) => r.storage);
    const xs = racks.map((r) => r.position[0]).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(RACK_DEPTH);
    for (const a of aisleLayouts(s.zones, s.racks)) {
      const [i, d] = ['I', 'D'].map((side) => racks.find((r) => r.rack.aisle === a.aisle && r.rack.side === side)!.position[0]);
      expect(d - i - RACK_DEPTH).toBeCloseTo(AISLE_W, 5);
    }
  });

  it('el andén con el portal RFID está delante de los racks', () => {
    expect(PORTAL_Z).toBeGreaterThan(STORAGE_Z);
    expect(FRONT_Z).toBeGreaterThan(PORTAL_Z);
    expect(pos.get('REC-01')![2]).toBeGreaterThan(pos.get('A-05-01')![2]);
  });

  it('B-03-01 (registrada) y D-07-02 (leída) están en zonas distintas', () => {
    expect(pos.get('B-03-01')![0]).toBeLessThan(pos.get('D-07-02')![0]);
  });
});

describe('recorrido de 6 pasos: estado "hecho" derivado del estado, navegación explícita', () => {
  it('cada paso se completa con su acción o al avanzar; avanzar no aprueba', () => {
    const done = (st: ReturnType<typeof createInitialState>) => demoSteps(st).map((x) => x.done);
    let s = createInitialState();
    expect(demoSteps(s).map((x) => x.id)).toEqual(['visualize', 'detect', 'alert', 'analyze', 'recommend', 'register']);
    expect(done(s)).toEqual([false, false, false, false, false, false]);
    s = demoReducer(s, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_RECEIPT_001' });
    s = demoReducer(s, { type: 'CLOSE_RECEIPT', purchaseOrderId: 'OC-2026-1187', closedAt: '2026-11-19T08:03:00Z' });
    s = demoReducer(s, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_COUNT_P4' });
    expect(done(s).slice(0, 2)).toEqual([true, true]);
    s = demoReducer(s, { type: 'SET_STEP', step: 5 });
    expect(done(s)).toEqual([true, true, true, true, false, false]);
    expect(s.recommendations.find((r) => r.id === 'rec-moc-001')!.status).toBe('PROPOSED');
    s = demoReducer(s, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-moc-001' });
    expect(done(s)).toEqual([true, true, true, true, true, true]);
    expect(demoReducer(s, { type: 'SET_STEP', step: 9 }).ui.step).toBe(5);
  });
});
