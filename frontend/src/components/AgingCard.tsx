// Semáforo de antigüedad del inventario: qué rota bien, qué se está estancando y qué ya es inventario hueso.
import { ArrowRight, Bone, CircleCheck, Hourglass } from 'lucide-react';
import { AGING_BANDS, agingBand, agingSummary, CRITICAL_DAYS, LOSS_RATE, type AgingBand, type AgingKey } from '../analytics/aging';
import { formatNumber, formatUsd } from '../domain/format';
import type { DemoState } from '../store/demoState';
import type { Actions } from './actions';

const ICON = { verde: CircleCheck, ambar: Hourglass, rojo: Bone } as const;

// Filtro pedido desde una ficha del semáforo para la próxima apertura de Inventario.
let pendingAging: AgingKey | null = null;
export function requestInventoryFilter(key: AgingKey) { pendingAging = key; }
export function takePendingAging(): AgingKey | 'ALL' { const k = pendingAging; pendingAging = null; return k ?? 'ALL'; }

/** Chip compacto: punto de color + días (para tablas). */
export function AgingChip({ days, showLabel = true }: { days: number; showLabel?: boolean }) {
  const b: AgingBand = agingBand(days);
  return (
    <span className={`aging-chip aging-${b.key}`} title={`${b.label} · ${b.hint}`}>
      <span className="aging-dot" aria-hidden />
      <strong>{formatNumber(days)} días</strong>
      {showLabel && <span className="aging-chip-label">{days > CRITICAL_DAYS ? 'Crítico' : b.label}</span>}
    </span>
  );
}

export default function AgingCard({ state, actions }: { state: DemoState; actions: Actions }) {
  const s = agingSummary(state);
  const openBand = (key: AgingKey) => { requestInventoryFilter(key); actions.setSection('inventario'); };
  return (
    <section className="card aging-card" data-testid="aging-card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Semáforo de inventario</h2>
          <p className="card-sub">Cuánto tiempo lleva cada caja en bodega. Lo que no rota pierde valor: muévelo antes de que sea hueso.</p>
        </div>
        <button type="button" className="btn btn-small" onClick={() => actions.setSection('acciones')}>Ver acciones <ArrowRight size={14} /></button>
      </div>

      <div className="aging-tiles">
        {s.bands.map((t) => {
          const Icon = ICON[t.band.key];
          return (
            <button key={t.band.key} type="button" className={`aging-tile aging-${t.band.key}`} data-testid={`aging-${t.band.key}`}
              onClick={() => openBand(t.band.key)} aria-label={`${t.band.label}: ${t.boxes} cajas, ver en inventario`}>
              <span className="aging-tile-top"><Icon size={18} aria-hidden /> {t.band.label}</span>
              <span className="aging-tile-num">{formatNumber(t.boxes)} <small>cajas</small></span>
              <span className="aging-tile-usd">{formatUsd(t.valueUsd)} · {formatNumber(t.pct * 100)} %</span>
              <span className="aging-tile-hint">{t.band.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="aging-bar" role="img" aria-label={s.bands.map((t) => `${t.band.label} ${formatNumber(t.pct * 100)} %`).join(', ')}>
        {s.bands.map((t) => <span key={t.band.key} className={`aging-${t.band.key}`} style={{ width: `${t.pct * 100}%` }} />)}
      </div>

      <div className="aging-risk" data-testid="aging-risk">
        <div>
          <div className="aging-risk-num">{formatUsd(s.estimatedLossUsd)}</div>
          <div className="aging-risk-txt">en riesgo de perderse si el inventario hueso no se mueve
            <span className="muted"> · supuesto: se pierde ~{Math.round(LOSS_RATE * 100)} % de su valor ({formatUsd(s.atRiskUsd)})</span></div>
        </div>
        {s.critical > 0 && <span className="aging-crit">{s.critical} cajas con más de {CRITICAL_DAYS} días</span>}
      </div>

      <h3 className="aging-sub">Lo más antiguo</h3>
      <ul className="aging-oldest">
        {s.oldest.map((r) => (
          <li key={r.unit.id}>
            <AgingChip days={r.days} showLabel={false} />
            <div className="aging-o-body"><div className="cell-main">{r.title}</div><div className="cell-sub">{r.unit.id} · {r.unit.expectedLocationId} · {formatUsd(r.valueUsd)}</div></div>
            <button type="button" className="btn btn-small" onClick={() => actions.locateUnit(r.unit.id)}>Ver en gemelo</button>
          </li>
        ))}
      </ul>
      <p className="note" style={{ margin: 0 }}>
        {AGING_BANDS.map((b, i) => `${b.short}: ${i === 0 ? '0–90' : i === 1 ? '91–180' : 'más de 180'} días`).join(' · ')}. Datos sintéticos de la demo.
      </p>
    </section>
  );
}
