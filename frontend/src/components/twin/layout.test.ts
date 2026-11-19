import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../store/demoState';
import { demoReducer } from '../../store/demoReducer';
import { nextDemoStep } from '../../store/selectors';
import { AISLE_W, FRONT_Z, PORTAL_Z, RACK_DEPTH, STORAGE_Z, aisleLayouts, locationPositions, rackLayouts } from './layout';

describe('layout del gemelo (derivado del estado)', () => {
  const s = createInitialState();
  const pos = locationPositions(s.zones, s.racks, s.locations);

  it('cada ubicación tiene una posición única', () => {
    expect(pos.size).toBe(s.locations.length);
    expect(new Set([...pos.values()].map((p) => p.join(','))).size).toBe(s.locations.length);
  });

  it('niveles más altos se dibujan más arriba', () => {
    expect(pos.get('P2-I03-N3')![1]).toBeGreaterThan(pos.get('P2-I03-N1')![1]);
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
    expect(pos.get('REC-01')![2]).toBeGreaterThan(pos.get('P1-I05-N1')![2]);
  });

  it('P2-I03-N1 (registrada) y P4-D02-N2 (leída) están en zonas distintas', () => {
    expect(pos.get('P2-I03-N1')![0]).toBeLessThan(pos.get('P4-D02-N2')![0]);
  });
});

describe('recorrido guiado derivado del estado (Detectar · Priorizar · Actuar · Medir)', () => {
  it('avanza receive -> count -> alert -> analytics -> approve -> measure -> done', () => {
    let s = createInitialState();
    expect(nextDemoStep(s)).toBe('receive');
    s = demoReducer(s, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_RECEIPT_001' });
    s = demoReducer(s, { type: 'CLOSE_RECEIPT', purchaseOrderId: 'OC-2026-1187', closedAt: '2026-11-19T08:03:00Z' });
    expect(nextDemoStep(s)).toBe('count');
    s = demoReducer(s, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_COUNT_P4' });
    expect(nextDemoStep(s)).toBe('alert');
    s = demoReducer(s, { type: 'SET_VIEW', view: 'alerts' });
    expect(nextDemoStep(s)).toBe('analytics');
    s = demoReducer(s, { type: 'SET_VIEW', view: 'analytics' });
    expect(nextDemoStep(s)).toBe('approve');
    s = demoReducer(s, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-moc-001' });
    expect(nextDemoStep(s)).toBe('approve'); // falta aprobar o rechazar el reclamo
    s = demoReducer(s, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-claim-oc-2026-1187' });
    expect(nextDemoStep(s)).toBe('measure');
    s = demoReducer(s, { type: 'SET_VIEW', view: 'measure' });
    expect(nextDemoStep(s)).toBe('done');
  });
});
