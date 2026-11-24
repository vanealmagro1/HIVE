// Lecturas en vivo de beacons: traducción a InventoryEvent, conciliación y conteo automático.
import { describe, expect, it } from 'vitest';
import { createActions } from '../components/actions';
import { BEACON_BOXES } from '../seed/seed';
import { createDemoStore } from '../store/demoStore';
import { beaconCount, eventHistory } from '../store/operations';
import catalog from '../../../beacons/beacons.json';
import { demoTimestamp, liveReadToEvent, type LiveRead } from './liveSource';

const read = (over: Partial<LiveRead> = {}): LiveRead => ({
  id: 'celular-4-1000', beacon: '4', ubicacion: 'B-05-03', rssi: -36, lector: 'celular', t: new Date(2026, 10, 24, 15, 6, 42).getTime(), ...over,
});

describe('lecturas en vivo de beacons', () => {
  it('el catálogo de beacons (beacons/beacons.json) coincide con las cajas de la semilla', () => {
    const s = createDemoStore().getState();
    for (const b of BEACON_BOXES) {
      const entry = catalog.beacons.find((e) => e.etiqueta === b.label);
      expect(entry?.unitId).toBe(b.unitId);
      expect(entry?.ubicacion).toBe(s.units.find((u) => u.id === b.unitId)?.expectedLocationId);
    }
  });

  it('una lectura se traduce a una observación BLE con la fecha de la demo y la hora real', () => {
    const ev = liveReadToEvent(read(), '2026-11-19')!;
    expect(ev).toMatchObject({
      id: 'ble-celular-4-1000', source: 'BLE', channel: 'BLE_BEACON', type: 'OBSERVATION', unitId: 'CJ-0003',
      locationHintId: 'B-05-03', readerId: 'celular', rssi: -36, capturedAt: '2026-11-19T15:06:42Z',
    });
    expect(demoTimestamp('2026-11-19', new Date(2026, 0, 1, 9, 5, 3).getTime())).toBe('2026-11-19T09:05:03Z');
    expect(liveReadToEvent(read({ beacon: '99' }), '2026-11-19')).toBeNull(); // beacon sin caja asignada
  });

  it('en su ubicación verifica la caja; en otra genera la alerta; la misma lectura no se duplica', () => {
    const store = createDemoStore();
    const actions = createActions(store);
    expect(store.getState().units.find((u) => u.id === 'CJ-0003')!.verificationStatus).toBe('EXPECTED');
    expect(beaconCount(store.getState())).toMatchObject({ verified: 0, total: 4, misplaced: 0 });

    const home = liveReadToEvent(read(), store.getState().referenceDate)!;
    actions.api.postEvent(home);
    actions.api.postEvent(home); // reenvío: idempotente
    let s = store.getState();
    expect(s.events.filter((e) => e.source === 'BLE')).toHaveLength(1);
    expect(s.units.find((u) => u.id === 'CJ-0003')!.verificationStatus).toBe('OBSERVED');
    expect(s.alerts).toHaveLength(0);
    expect(beaconCount(s)).toMatchObject({ verified: 1, lastLabel: '4' });
    const row = eventHistory(s).find((r) => r.id === home.id)!;
    expect(row).toMatchObject({ kind: 'Detección', unitLabel: 'CJ-0003', origin: 'Beacon · celular', live: true });
    expect(row.status.label).toBe('Verificada');

    actions.simulateBeacon('7', 'away');
    s = store.getState();
    expect(s.alerts.map((a) => a.type)).toEqual(['LOCATION_MISMATCH']);
    expect(beaconCount(s)).toMatchObject({ verified: 1, misplaced: 1, lastLabel: '7' });
    expect(s.lastMessage?.text).toMatch(/Esferográfico punta fina negro \(CJ-0022\) leída en A-02-01; su ubicación es B-01-03/);
  });

  it('el plan B (simulateBeacon) verifica por el mismo camino que una lectura real', () => {
    const store = createDemoStore();
    const actions = createActions(store);
    for (const b of BEACON_BOXES) actions.simulateBeacon(b.label, 'home');
    expect(beaconCount(store.getState())).toMatchObject({ verified: BEACON_BOXES.length, misplaced: 0 });
    expect(store.getState().lastMessage?.text).toMatch(/Regla 30 cm estándar \(CJ-0138\) verificada en B-08-02/);
  });
});
