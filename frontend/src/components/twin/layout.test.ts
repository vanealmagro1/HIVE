import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../store/demoState';
import { demoReducer } from '../../store/demoReducer';
import { nextDemoStep } from '../../store/selectors';
import { locationPositions, rackLayouts } from './layout';

describe('layout del gemelo (derivado del estado)', () => {
  const s = createInitialState();
  const pos = locationPositions(s.zones, s.racks, s.locations);

  it('cada ubicación tiene una posición única', () => {
    expect(pos.size).toBe(s.locations.length);
    expect(new Set([...pos.values()].map((p) => p.join(','))).size).toBe(s.locations.length);
  });

  it('niveles más altos se dibujan más arriba y los racks no se superponen', () => {
    expect(pos.get('LOC-A3')![1]).toBeGreaterThan(pos.get('LOC-A1')![1]);
    const racks = rackLayouts(s.zones, s.racks);
    expect(new Set(racks.map((r) => `${r.position[0]},${r.position[2]}`)).size).toBe(6);
  });

  it('LOC-A1 (esperada) y LOC-B2 (observada) están en zonas distintas', () => {
    expect(pos.get('LOC-A1')![0]).not.toBe(pos.get('LOC-B2')![0]);
  });
});

describe('recorrido guiado derivado del estado', () => {
  it('avanza select -> event -> alert -> analytics -> approve -> done', () => {
    let s = createInitialState();
    expect(nextDemoStep(s)).toBe('select');
    s = demoReducer(s, { type: 'SELECT_UNIT', unitId: 'PAL-001' });
    expect(nextDemoStep(s)).toBe('event');
    s = demoReducer(s, { type: 'RUN_SCENARIO', scenarioId: 'DEMO_MOVE_001' });
    expect(nextDemoStep(s)).toBe('alert');
    s = demoReducer(s, { type: 'SET_VIEW', view: 'alerts' });
    expect(nextDemoStep(s)).toBe('analytics');
    s = demoReducer(s, { type: 'SET_VIEW', view: 'analytics' });
    expect(nextDemoStep(s)).toBe('approve');
    s = demoReducer(s, { type: 'APPROVE_RECOMMENDATION', recommendationId: 'rec-sku-a' });
    expect(nextDemoStep(s)).toBe('done');
  });
});
