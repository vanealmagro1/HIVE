// Vista 2D de respaldo (sin WebGL). Mismo estado y mismas acciones que el 3D.
import type { DemoState } from '../../store/demoState';
import { STATUS_ICON, STATUS_LABEL, unitsWithOpenAlerts } from '../../store/selectors';

interface Props {
  state: DemoState;
  expiryRiskLots: Set<string>;
  onSelect: (unitId: string) => void;
}

export default function Warehouse2D({ state, expiryRiskLots, onSelect }: Props) {
  const alerting = unitsWithOpenAlerts(state);
  const selected = state.units.find((u) => u.id === state.ui.selectedUnitId);
  const selectedPalletId = selected?.type === 'BOX' ? selected.parentId : selected?.id;
  const pallets = state.units.filter((u) => u.type === 'PALLET');

  return (
    <div className="twin2d" data-testid="warehouse-2d">
      {state.zones.map((zone) => (
        <section key={zone.id} className="twin2d-zone" aria-label={zone.name}>
          <h3>{zone.name}</h3>
          <div className="twin2d-racks">
            {state.racks.filter((r) => r.zoneId === zone.id).map((rack) => (
              <div key={rack.id} className="twin2d-rack">
                <div className="twin2d-rack-name">{rack.name}</div>
                {state.locations.filter((l) => l.rackId === rack.id).sort((a, b) => b.level - a.level).map((loc) => {
                  const unit = pallets.find((p) => p.expectedLocationId === loc.id);
                  const observedHere = pallets.filter((p) => p.observedLocationId === loc.id && p.expectedLocationId !== loc.id);
                  const isExpectedOfMismatch = pallets.some((p) => p.expectedLocationId === loc.id && p.observedLocationId && p.observedLocationId !== loc.id);
                  return (
                    <div key={loc.id} className={`twin2d-loc${isExpectedOfMismatch ? ' is-expected' : ''}${observedHere.length ? ' is-observed' : ''}`}>
                      <span className="twin2d-loc-id">{loc.id} · N{loc.level}</span>
                      {unit && (
                        <button
                          type="button"
                          className={`unit-chip status-${unit.verificationStatus}${selectedPalletId === unit.id ? ' is-selected' : ''}`}
                          onClick={() => onSelect(unit.id)}
                          aria-pressed={selectedPalletId === unit.id}
                          title={STATUS_LABEL[unit.verificationStatus]}
                        >
                          {STATUS_ICON[unit.verificationStatus]} {unit.id}
                          {alerting.has(unit.id) && ' · ' + STATUS_LABEL[unit.verificationStatus]}
                          {unit.lotId && expiryRiskLots.has(unit.lotId) && ' · ⏳ vence pronto'}
                        </button>
                      )}
                      {observedHere.map((p) => (
                        <span key={p.id} className="ghost-chip">◇ Leído aquí: {p.id} (lectura RFID simulada)</span>
                      ))}
                      {isExpectedOfMismatch && <span className="expected-tag">▭ Ubicación registrada</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
