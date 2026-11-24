import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../store/demoState';
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
