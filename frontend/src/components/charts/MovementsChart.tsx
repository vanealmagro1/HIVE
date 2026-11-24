// Barras agrupadas por día: entradas, salidas y traslados (unidades confirmadas).
import { formatNumber } from '../../domain/format';
import { fmtDay, type DayMovement } from '../../store/operations';

const SERIES = [
  { key: 'entradas', label: 'Entradas', color: '#6a3fd6' },
  { key: 'salidas', label: 'Salidas', color: '#b9a2f2' },
  { key: 'traslados', label: 'Traslados', color: '#f0a429' },
] as const;

const W = 640;
const H = 200;
const PAD = { top: 10, right: 8, bottom: 24, left: 36 };

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

export default function MovementsChart({ data }: { data: DayMovement[] }) {
  const max = niceMax(Math.max(...data.flatMap((d) => [d.entradas, d.salidas, d.traslados])));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(14, (slot * 0.7) / 3);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const every = data.length > 10 ? 2 : 1;
  return (
    <div className="bars" data-testid="movements-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Movimientos de inventario de los últimos ${data.length} días`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#ebe8f2" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="chart-axis">{formatNumber(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = PAD.left + slot * i + (slot - barW * 3 - 4) / 2;
          return (
            <g key={d.date}>
              {SERIES.map((s, k) => {
                const v = d[s.key];
                return v > 0 ? (
                  <rect key={s.key} x={x0 + k * (barW + 2)} y={y(v)} width={barW} height={y(0) - y(v)} rx={3} fill={s.color}>
                    <title>{`${fmtDay(d.date)} · ${s.label}: ${formatNumber(v)} u`}</title>
                  </rect>
                ) : null;
              })}
              {i % every === 0 && <text x={PAD.left + slot * i + slot / 2} y={H - 6} textAnchor="middle" className="chart-axis">{fmtDay(d.date).replace('-', ' ')}</text>}
            </g>
          );
        })}
      </svg>
      <div className="bars-legend">
        {SERIES.map((s) => <span key={s.key}><span className="sw" style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}
