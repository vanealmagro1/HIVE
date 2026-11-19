// Vista 2D de respaldo (sin WebGL). Mismo estado y mismas acciones que el 3D.
// Plano por zonas → pasillos → racks (bahías × niveles). Cada celda es una ubicación.
import type { LogisticUnit } from '../../domain/types';
import type { DemoState } from '../../store/demoState';
import { placeName, STATUS_LABEL, skuOfUnit, unitsWithOpenAlerts } from '../../store/selectors';
import { STATUS_COLOR } from './colors';

interface Props {
  state: DemoState;
  expiryRiskLots: Set<string>;
  onSelect: (unitId: string) => void;
}

export default function Warehouse2D({ state, expiryRiskLots, onSelect }: Props) {
  const alerting = unitsWithOpenAlerts(state);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId);
  const selectedRootId = selected?.parentId ?? selected?.id;
  const roots = new Map<string, LogisticUnit[]>();
  for (const u of state.units) if (!u.parentId) roots.set(u.expectedLocationId, [...(roots.get(u.expectedLocationId) ?? []), u]);
  const ghosts = state.units.filter((u) => !u.parentId && u.observedLocationId && u.observedLocationId !== u.expectedLocationId);
  const observedAt = new Set(ghosts.map((g) => g.observedLocationId!));
  const expectedOfGhost = new Set(ghosts.map((g) => g.expectedLocationId));
  const storageZones = state.zones.filter((z) => z.kind !== 'RECEIVING');
  const levels = [...new Set(state.locations.map((l) => l.level))].sort((a, b) => b - a);

  const cell = (locId: string) => {
    const list = roots.get(locId) ?? [];
    const main = list[0];
    const cls = ['cell2d', expectedOfGhost.has(locId) ? 'is-expected' : '', observedAt.has(locId) ? 'is-observed' : '',
      list.some((u) => u.id === selectedRootId) ? 'is-selected' : ''].join(' ');
    if (!main) return <div key={locId} className={cls} title={`${locId} · libre`}>{observedAt.has(locId) ? '◇' : ''}</div>;
    const sku = skuOfUnit(state, main);
    const risk = main.lotId !== null && expiryRiskLots.has(main.lotId);
    const label = `${main.id} · ${sku?.name ?? ''} · ${STATUS_LABEL[main.verificationStatus]}${list.length > 1 ? ` · ${list.length} cajas` : ''}`;
    return (
      <button
        key={locId}
        type="button"
        className={cls}
        style={{ background: STATUS_COLOR[main.verificationStatus] }}
        onClick={() => onSelect(main.id)}
        aria-label={label}
        aria-pressed={list.some((u) => u.id === selectedRootId)}
        title={`${locId} · ${label}`}
      >
        {main.type === 'PALLET' ? '▣' : list.length}
        {alerting.has(main.id) && '⚠'}
        {risk && '⏳'}
      </button>
    );
  };

  return (
    <div className="twin2d" data-testid="warehouse-2d">
      {ghosts.length > 0 && (
        <div className="twin2d-notes">
          {ghosts.map((g) => (
            <span key={g.id} className="ghost-chip">◇ Leído aquí: {g.id} (lectura RFID simulada) en {placeName(state, g.observedLocationId)} · registrado en {g.expectedLocationId}</span>
          ))}
        </div>
      )}
      <div className="twin2d-zones">
        {storageZones.map((zone) => {
          const racks = state.racks.filter((r) => r.zoneId === zone.id);
          const aisles = [...new Set(racks.map((r) => r.aisle!))].sort((a, b) => a - b);
          return (
            <section key={zone.id} className="twin2d-zone" aria-label={zone.name}>
              <h3>{zone.name} · <span className="muted">{zone.category}</span></h3>
              <div className="twin2d-aisles">
                {aisles.map((a) => (
                  <div key={a} className="twin2d-aisle">
                    {(['I', 'D'] as const).map((side) => {
                      const rack = racks.find((r) => r.aisle === a && r.side === side);
                      if (!rack) return null;
                      const locs = state.locations.filter((l) => l.rackId === rack.id);
                      const bays = [...new Set(locs.map((l) => l.slot))].sort((x, y) => x - y);
                      return (
                        <div key={side} className="twin2d-rack">
                          <div className="twin2d-rack-name">{rack.name}</div>
                          <div className="grid2d" style={{ gridTemplateColumns: `repeat(${bays.length}, 1fr)` }}>
                            {levels.flatMap((lv) => bays.map((b) => {
                              const loc = locs.find((l) => l.slot === b && l.level === lv);
                              return loc ? cell(loc.id) : <div key={`${b}-${lv}`} />;
                            }))}
                          </div>
                        </div>
                      );
                    })}
                    <div className="twin2d-aisle-name">P{a}</div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <section className="twin2d-zone">
        <h3>Andén de recepción · portal RFID</h3>
        <div className="grid2d" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {state.locations.filter((l) => l.id.startsWith('REC-')).map((l) => cell(l.id))}
        </div>
      </section>
    </div>
  );
}
