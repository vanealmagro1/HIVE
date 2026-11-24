// Gráficas de un producto para Analítica: demanda diaria en barras y evolución del stock con proyección.
// Ventana corta (14 días + proyección) para que cada día se lea con claridad. Datos de analytics/series.
import { useEffect, useRef, useState } from 'react';
import type { SkuAnalytics } from '../../analytics/analytics';
import { demandSeries, stockSeries } from '../../analytics/series';
import { formatNumber } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { fmtDay } from '../../store/operations';

const HISTORY_DAYS = 14;
const H = 230;

/** Ancho real del contenedor: el SVG se dibuja a 1:1 para que el texto no se encoja. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
const PAD = { top: 18, right: 12, bottom: 28, left: 40 };
const C = { hist: '#6a3fd6', proj: '#c9b8f5', grid: '#ebe8f2', axis: '#8a86a0', target: '#e0942a', today: '#b9b3cc' };

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const step = 10 ** Math.floor(Math.log10(v));
  const m = v / step;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * step;
}

function Axis({ W, max, y }: { W: number; max: number; y: (v: number) => number }) {
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} stroke={C.grid} />
          <text x={PAD.left - 8} y={y(max * f) + 4} textAnchor="end" className="pc-axis">{formatNumber(max * f)}</text>
        </g>
      ))}
    </>
  );
}

interface Hover { x: number; y: number; title: string; value: string }

function Tip({ W, h }: { W: number; h: Hover | null }) {
  if (!h) return null;
  return (
    <div className="pc-tip" style={{ left: `${(h.x / W) * 100}%`, top: `${(h.y / H) * 100}%` }}>
      <div className="pc-tip-title">{h.title}</div><div>{h.value}</div>
    </div>
  );
}

export function DemandBars({ state, a }: { state: DemoState; a: SkuAnalytics }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [box, W] = useWidth();
  const d = demandSeries(state, a.skuId, a);
  const hist = d.history.slice(-HISTORY_DAYS).map((p) => ({ date: p.date, v: p.units, proj: false }));
  const proj = d.projection.slice(0, 7).map((p) => ({ date: p.date, v: p.units, proj: true }));
  const bars = [...hist, ...proj];
  const max = niceMax(Math.max(1, ...bars.map((b) => b.v)) * 1.1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / bars.length;
  const bw = Math.min(26, slot * 0.62);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const splitX = PAD.left + slot * hist.length;
  return (
    <div className="pc" data-testid="demand-chart">
      <div className="pc-legend">
        <span><span className="sw" style={{ background: C.hist }} />Despachos por día</span>
        {proj.length > 0 && <span><span className="sw" style={{ background: C.proj }} />Proyección (promedio)</span>}
      </div>
      <div className="pc-plot" ref={box} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Demanda diaria de ${a.skuName}: últimos ${hist.length} días${d.mean !== null ? ` y proyección de ${formatNumber(d.mean, 1)} u/día` : ''}`}>
          <Axis W={W} max={max} y={y} />
          {proj.length > 0 && <rect x={splitX} y={PAD.top} width={W - PAD.right - splitX} height={innerH} fill="#f7f5fc" />}
          {bars.map((b, i) => {
            const x = PAD.left + slot * i + (slot - bw) / 2;
            return (
              <rect key={b.date} x={x} y={y(b.v)} width={bw} height={Math.max(0, y(0) - y(b.v))} rx={4}
                fill={b.proj ? C.proj : C.hist} opacity={hover && hover.title.startsWith(fmtDay(b.date)) ? 0.75 : 1}
                onMouseEnter={() => setHover({ x: x + bw / 2, y: y(b.v), title: `${fmtDay(b.date)}${b.proj ? ' · proyección' : ''}`, value: `${formatNumber(b.v, Number.isInteger(b.v) ? 0 : 1)} unidades` })} />
            );
          })}
          {d.mean !== null && <line x1={PAD.left} x2={W - PAD.right} y1={y(d.mean)} y2={y(d.mean)} stroke={C.target} strokeDasharray="5 4" strokeWidth={1.5} />}
          {d.mean !== null && <text x={W - PAD.right} y={y(d.mean) - 6} textAnchor="end" className="pc-label" fill={C.target}>Promedio {formatNumber(d.mean, 1)}/día</text>}
          {proj.length > 0 && <text x={splitX + 6} y={PAD.top + 12} className="pc-axis">Hoy →</text>}
          {bars.map((b, i) => i % Math.max(1, Math.ceil(52 / slot)) === 0 && (
            <text key={b.date} x={PAD.left + slot * i + slot / 2} y={H - 8} textAnchor="middle" className="pc-axis">{fmtDay(b.date)}</text>
          ))}
        </svg>
        <Tip W={W} h={hover} />
      </div>
    </div>
  );
}

export function StockLine({ state, a }: { state: DemoState; a: SkuAnalytics }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [box, W] = useWidth();
  const s = stockSeries(state, a.skuId, a);
  const hist = s.history.slice(-(HISTORY_DAYS + 1)).map((p) => ({ date: p.date, v: p.stock }));
  const proj = s.projection.slice(1, HISTORY_DAYS + 1).map((p) => ({ date: p.date, v: p.stock }));
  const pts = [...hist, ...proj];
  const max = niceMax(Math.max(1, ...pts.map((p) => p.v), s.targetStock ?? 0) * 1.1);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (innerW * i) / Math.max(1, pts.length - 1);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = (from: number, list: { v: number }[]) => list.map((p, i) => `${i ? 'L' : 'M'}${x(from + i)},${y(p.v)}`).join(' ');
  const todayI = hist.length - 1;
  const labelEvery = Math.max(1, Math.ceil(56 / (innerW / pts.length)));
  const area = `${line(0, hist)} L${x(todayI)},${y(0)} L${x(0)},${y(0)} Z`;
  return (
    <div className="pc" data-testid="stock-chart">
      <div className="pc-legend">
        <span><span className="sw" style={{ background: C.hist }} />Stock registrado</span>
        {proj.length > 0 && <span><span className="sw sw-dash" style={{ borderColor: C.hist }} />Proyección sin reposición</span>}
        {s.targetStock !== null && <span><span className="sw sw-dash" style={{ borderColor: C.target }} />Stock objetivo</span>}
      </div>
      <div className="pc-plot" ref={box} onMouseLeave={() => setHover(null)}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Stock de ${a.skuName}: hoy ${formatNumber(a.stock)} u${s.targetStock !== null ? `, objetivo ${formatNumber(s.targetStock)} u` : ''}`}>
          <defs>
            <linearGradient id="pc-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.hist} stopOpacity={0.22} /><stop offset="100%" stopColor={C.hist} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Axis W={W} max={max} y={y} />
          {proj.length > 0 && <rect x={x(todayI)} y={PAD.top} width={W - PAD.right - x(todayI)} height={innerH} fill="#f7f5fc" />}
          <path d={area} fill="url(#pc-area)" />
          <path d={line(0, hist)} fill="none" stroke={C.hist} strokeWidth={2.5} strokeLinejoin="round" />
          {proj.length > 0 && <path d={line(todayI, [hist[todayI], ...proj])} fill="none" stroke={C.hist} strokeWidth={2} strokeDasharray="6 5" />}
          {s.targetStock !== null && (
            <>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(s.targetStock)} y2={y(s.targetStock)} stroke={C.target} strokeDasharray="5 4" strokeWidth={1.5} />
              <text x={PAD.left + 6} y={y(s.targetStock) - 6} className="pc-label" fill={C.target}>Objetivo {formatNumber(s.targetStock)} u</text>
            </>
          )}
          <circle cx={x(todayI)} cy={y(hist[todayI].v)} r={5} fill="#fff" stroke={C.hist} strokeWidth={2.5} />
          <text x={x(todayI)} y={y(hist[todayI].v) - 10} textAnchor="middle" className="pc-label" fill={C.hist}>Hoy {formatNumber(hist[todayI].v)} u</text>
          {pts.map((p, i) => (
            <rect key={p.date} x={x(i) - innerW / pts.length / 2} y={PAD.top} width={innerW / pts.length} height={innerH} fill="transparent"
              onMouseEnter={() => setHover({ x: x(i), y: y(p.v), title: `${fmtDay(p.date)}${i > todayI ? ' · proyección' : ''}`, value: `${formatNumber(p.v)} unidades` })} />
          ))}
          {pts.map((p, i) => (i === todayI || (i % labelEvery === 0 && Math.abs(i - todayI) >= labelEvery)) && (
            <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" className="pc-axis">{i === todayI ? 'Hoy' : fmtDay(p.date)}</text>
          ))}
        </svg>
        <Tip W={W} h={hover} />
      </div>
    </div>
  );
}
