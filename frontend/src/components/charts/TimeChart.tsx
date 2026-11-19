// Gráfica temporal en SVG propio (sin dependencias). Un solo eje Y, marcas finas, rejilla recesiva,
// cruz + tooltip al pasar el cursor, leyenda cuando hay ≥ 2 series y tabla de datos accesible.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { daysBetween } from '../../domain/dates';
import { formatNumber } from '../../domain/format';

export interface ChartSeries {
  id: string;
  label: string;
  points: { date: string; value: number }[];
  dashed?: boolean;
  color: string;
}
export interface ChartBand { label: string; points: { date: string; low: number; high: number }[]; color: string }
export interface ChartRef { value: number; label: string }
export interface ChartMarker { date: string; value: number; label: string }

interface Props {
  title?: ReactNode;
  series: ChartSeries[];
  band?: ChartBand | null;
  reference?: ChartRef | null;
  markers?: ChartMarker[];
  /** Fecha que separa lo registrado de lo proyectado. */
  today?: string;
  height?: number;
  compact?: boolean;
  unit?: string;
  testId?: string;
  ariaLabel: string;
}

const PAD = { top: 12, right: 14, bottom: 22, left: 40 };
const PAD_COMPACT = { top: 8, right: 8, bottom: 16, left: 30 };

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => { if (el.clientWidth > 0) setW(el.clientWidth); };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Paso de eje "bonito" para ~4 divisiones. */
function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

export default function TimeChart({ title, series, band, reference, markers = [], today, height = 200, compact = false, unit = 'u', testId, ariaLabel }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = compact ? PAD_COMPACT : PAD;

  const { dates, xOf, yOf, ticks } = useMemo(() => {
    const all = new Set<string>();
    series.forEach((s) => s.points.forEach((p) => all.add(p.date)));
    band?.points.forEach((p) => all.add(p.date));
    const sorted = [...all].sort();
    const f = sorted[0] ?? '2026-01-01';
    const span = Math.max(1, daysBetween(f, sorted.at(-1) ?? f));
    const values = [
      ...series.flatMap((s) => s.points.map((p) => p.value)),
      ...(band?.points.map((p) => p.high) ?? []),
      ...(reference ? [reference.value] : []),
      ...markers.map((m) => m.value),
    ];
    const peak = Math.max(1, ...values) * 1.12; // margen superior: la línea no toca el borde
    const step = niceStep(peak);
    const top = Math.ceil(peak / step) * step;
    const innerW = Math.max(40, width - pad.left - pad.right);
    const innerH = height - pad.top - pad.bottom;
    return {
      dates: sorted,
      ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step),
      xOf: (d: string) => pad.left + (daysBetween(f, d) / span) * innerW,
      yOf: (v: number) => pad.top + innerH - (v / top) * innerH,
    };
  }, [series, band, reference, markers, width, height, pad.left, pad.right, pad.top, pad.bottom]);

  const path = (pts: { date: string; value: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.date).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(' ');
  const bandPath = band && band.points.length
    ? `${band.points.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.date).toFixed(1)},${yOf(p.high).toFixed(1)}`).join(' ')} `
      + `${[...band.points].reverse().map((p) => `L${xOf(p.date).toFixed(1)},${yOf(p.low).toFixed(1)}`).join(' ')} Z`
    : null;

  const hoverDate = hover === null ? null : dates[hover];
  const valuesAt = (date: string) => series
    .map((s) => ({ s, p: s.points.find((p) => p.date === date) }))
    .filter((x): x is { s: ChartSeries; p: { date: string; value: number } } => !!x.p);
  const bandAt = hoverDate && band ? band.points.find((p) => p.date === hoverDate) : undefined;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left + pad.left;
    let best = 0;
    let dist = Infinity;
    dates.forEach((d, i) => { const dd = Math.abs(xOf(d) - x); if (dd < dist) { dist = dd; best = i; } });
    setHover(best);
  };

  const xTicks = dates.length ? [dates[0], ...(today ? [today] : []), dates[dates.length - 1]].filter((d, i, arr) => arr.indexOf(d) === i) : [];
  const fmt = (v: number) => formatNumber(v, Number.isInteger(v) || v >= 100 ? 0 : 1);
  const tipLeft = hoverDate ? Math.min(Math.max(xOf(hoverDate) + 10, 0), Math.max(0, width - 170)) : 0;

  return (
    <figure className={`chart${compact ? ' chart-compact' : ''}`} data-testid={testId}>
      {title && <figcaption className="chart-title">{title}</figcaption>}
      {!compact && series.length + (band ? 1 : 0) + (reference ? 1 : 0) >= 2 && (
        <div className="chart-legend" aria-hidden>
          {series.map((s) => (
            <span key={s.id}><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '4 3' : undefined} strokeLinecap="round" /></svg>{s.label}</span>
          ))}
          {band && <span><span className="swatch-band" style={{ background: band.color }} />{band.label}</span>}
          {reference && <span><svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke="var(--text-2)" strokeWidth="1.5" strokeDasharray="2 3" /></svg>{reference.label}</span>}
        </div>
      )}
      <div className="chart-plot" ref={wrapRef} style={{ height }}>
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={yOf(t)} y2={yOf(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={pad.left - 6} y={yOf(t) + 3.5} textAnchor="end" className="chart-axis">{formatNumber(t)}</text>
            </g>
          ))}
          {today && (
            <g>
              <rect x={xOf(today)} y={pad.top} width={Math.max(0, width - pad.right - xOf(today))} height={height - pad.top - pad.bottom} fill="var(--surface-2)" />
              <line x1={xOf(today)} x2={xOf(today)} y1={pad.top} y2={height - pad.bottom} stroke="var(--line-strong)" strokeWidth="1" />
              {!compact && <text x={xOf(today) + 4} y={pad.top + 10} className="chart-axis">Hoy · proyección →</text>}
            </g>
          )}
          {bandPath && <path d={bandPath} fill={band!.color} stroke="none" />}
          {reference && (
            <g>
              <line x1={pad.left} x2={width - pad.right} y1={yOf(reference.value)} y2={yOf(reference.value)} stroke="var(--text-2)" strokeWidth="1.5" strokeDasharray="2 3" />
              {!compact && <text x={width - pad.right} y={yOf(reference.value) - 4} textAnchor="end" className="chart-axis">{reference.label} · {fmt(reference.value)} {unit}</text>}
            </g>
          )}
          {series.map((s) => (
            <path key={s.id} d={path(s.points)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
          ))}
          {markers.map((m) => (
            <g key={`${m.date}-${m.label}`}>
              <circle cx={xOf(m.date)} cy={yOf(m.value)} r="4.5" fill="var(--warning)" stroke="var(--card)" strokeWidth="2" />
              {!compact && <text x={xOf(m.date)} y={yOf(m.value) - 9} textAnchor="middle" className="chart-axis chart-marker-label">{m.label}</text>}
            </g>
          ))}
          {xTicks.map((d) => (
            <text key={d} x={xOf(d)} y={height - 5} textAnchor={d === dates[0] ? 'start' : d === dates.at(-1) ? 'end' : 'middle'} className="chart-axis">{d === today ? 'Hoy' : shortDate(d)}</text>
          ))}
          {hoverDate && (
            <g pointerEvents="none">
              <line x1={xOf(hoverDate)} x2={xOf(hoverDate)} y1={pad.top} y2={height - pad.bottom} stroke="var(--text-2)" strokeWidth="1" />
              {valuesAt(hoverDate).map(({ s, p }) => <circle key={s.id} cx={xOf(hoverDate)} cy={yOf(p.value)} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />)}
            </g>
          )}
          <rect x={pad.left} y={pad.top} width={Math.max(0, width - pad.left - pad.right)} height={height - pad.top - pad.bottom}
            fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} data-testid={testId ? `${testId}-hit` : undefined} />
        </svg>
        {hoverDate && (
          <div className="chart-tip" style={{ left: tipLeft }} role="status">
            <div className="chart-tip-date">{hoverDate}{today && hoverDate > today ? ' · proyección' : ''}</div>
            {valuesAt(hoverDate).map(({ s, p }) => (
              <div key={s.id} className="chart-tip-row"><span className="chart-tip-key" style={{ background: s.color }} />{s.label}<strong>{fmt(p.value)} {unit}</strong></div>
            ))}
            {bandAt && <div className="chart-tip-row muted">{band!.label}: {fmt(bandAt.low)}–{fmt(bandAt.high)} {unit}</div>}
            {reference && <div className="chart-tip-row muted">{reference.label}: {fmt(reference.value)} {unit}</div>}
          </div>
        )}
      </div>
      {!compact && (
        <details className="chart-table">
          <summary>Ver datos</summary>
          <table className="small">
            <thead><tr><th>Fecha</th>{series.map((s) => <th key={s.id}>{s.label}</th>)}</tr></thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d}><td>{d}</td>{series.map((s) => { const p = s.points.find((x) => x.date === d); return <td key={s.id}>{p ? fmt(p.value) : '—'}</td>; })}</tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}
