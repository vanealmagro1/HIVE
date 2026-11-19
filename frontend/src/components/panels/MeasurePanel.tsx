import { formatNumber, formatUsd } from '../../domain/format';
import type { DemoState } from '../../store/demoState';
import { alertStory, COUNT_SCENARIO_ID } from '../../store/selectors';

const secondsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);

/** Indicadores de la sesión, calculados SOLO con los eventos y decisiones registrados en el estado. */
export function sessionMetrics(state: DemoState) {
  const po = state.purchaseOrders[0];
  const portal = state.events.filter((e) => e.channel === 'RFID_PORTAL');
  const count = state.events.filter((e) => e.channel === 'RFID_HANDHELD' && (e.scenarioId === COUNT_SCENARIO_ID || e.id === 'evt-demo-001'));
  const countMismatch = count.filter((e) => {
    const u = state.units.find((x) => x.id === e.unitId);
    return u && e.locationHintId !== u.expectedLocationId;
  }).length;
  const open = state.alerts.filter((a) => a.status !== 'RESOLVED');
  const inReview = open.reduce((s, a) => s + alertStory(state, a).usd, 0);
  const approved = state.recommendations.filter((r) => r.status === 'APPROVED');
  return {
    reads: state.events.length,
    tags: new Set(state.events.map((e) => e.epc ?? e.unitId)).size,
    receivedBoxes: po?.receivedBoxIds.length ?? 0,
    announcedBoxes: po?.boxes.length ?? 0,
    receiptSeconds: portal.length > 1 ? secondsBetween(portal[0].capturedAt, portal[portal.length - 1].capturedAt) : 0,
    countReads: count.length,
    countMatches: count.length - countMismatch,
    findings: open.length,
    inReviewUsd: inReview,
    tasks: state.tasks.filter((t) => t.status === 'OPEN').length,
    approvedImpactUsd: approved.reduce((s, r) => s + (r.estimatedImpactUsd ?? 0), 0),
  };
}

export default function MeasurePanel({ state }: { state: DemoState }) {
  const m = sessionMetrics(state);
  const pct = m.countReads ? (m.countMatches / m.countReads) * 100 : null;
  return (
    <div data-testid="measure-panel">
      <h2>Resultados de la sesión</h2>
      <p className="panel-intro">Medir es la última parte del ciclo: estos indicadores salen de las lecturas y decisiones registradas, no de una hoja de cálculo aparte.</p>
      <div className="metrics" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="metric"><div className="metric-label">Cajas recibidas por portal RFID</div><div className="metric-value">{m.receivedBoxes} / {m.announcedBoxes}</div></div>
        <div className="metric"><div className="metric-label">Tiempo de lectura en el andén</div><div className="metric-value">{m.receiptSeconds} s</div></div>
        <div className="metric"><div className="metric-label">Etiquetas en su lugar · pasillo 4</div><div className="metric-value">{pct === null ? '—' : `${formatNumber(pct, 1)} %`}</div></div>
        <div className="metric"><div className="metric-label">Hallazgos por verificar</div><div className="metric-value">{m.findings} · {formatUsd(m.inReviewUsd)}</div></div>
        <div className="metric"><div className="metric-label">Acciones aprobadas</div><div className="metric-value">{m.tasks} tareas</div></div>
        <div className="metric"><div className="metric-label">Impacto estimado de lo aprobado</div><div className="metric-value">{formatUsd(m.approvedImpactUsd)}</div></div>
      </div>
      <ul className="small" style={{ marginTop: 12 }}>
        <li>{formatNumber(m.reads)} lecturas RFID procesadas ({formatNumber(m.tags)} etiquetas distintas), sin digitar códigos.</li>
        <li>Conteo del pasillo 4: {m.countMatches} de {m.countReads} etiquetas respondieron en su ubicación registrada.</li>
        <li>El inventario solo cambió por lo leído en la recepción; los hallazgos esperan verificación humana.</li>
      </ul>
      <div className="result-box ok small">
        Datos de una sesión simulada. En un piloto, estos mismos indicadores se comparan con una línea base medida
        en la bodega del cliente (tiempo de recepción, exactitud, errores de despacho) para comprobar la mejora.
      </div>
    </div>
  );
}
