import { formatUsd } from '../../domain/format';
import { SCENARIOS } from '../../engine/scenarios';
import type { DemoState } from '../../store/demoState';
import { alertStory, eventSourceLabel, fmtUnits, placeName, PRIORITY_LABEL } from '../../store/selectors';
import type { Actions } from '../actions';
import RecommendationCard from './RecommendationCard';

const ALERT_STATUS: Record<string, string> = { NEW: 'NUEVA', IN_REVIEW: 'EN REVISIÓN', RESOLVED: 'RESUELTA' };

export default function AlertsPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const verifyRecs = state.recommendations.filter((r) => r.type === 'VERIFY_LOCATION');
  // Priorizar: primero lo de mayor prioridad y, a igualdad, lo de mayor valor involucrado.
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  const alerts = [...state.alerts].sort((a, b) => order[a.priority] - order[b.priority]
    || alertStory(state, b).usd - alertStory(state, a).usd);

  return (
    <div data-testid="alerts-panel">
      <h2>Alertas</h2>
      <p className="panel-intro">HIVE compara lo registrado con lo que leen los lectores RFID. Cada alerta dice qué pasó, cuánto vale y qué hacer.</p>
      {alerts.length === 0 && <div className="result-box ok">Sin diferencias entre el registro y las lecturas RFID.</div>}
      {alerts.map((a) => {
        const story = alertStory(state, a);
        const disc = state.discrepancies.find((d) => d.unitId === a.unitId && d.kind === a.type);
        const events = state.events.filter((e) => a.evidenceEventIds.includes(e.id));
        return (
          <article key={a.id} className={`alert-card prio-${a.priority}`} data-testid={`alert-${a.id}`}>
            <div className="alert-head">
              <span className={`prio prio-tag-${a.priority}`}>PRIORIDAD {PRIORITY_LABEL[a.priority]}</span>
              <span className="pill">{ALERT_STATUS[a.status]}</span>
              {disc && <span className="pill">POR VERIFICAR</span>}
            </div>
            <div className="alert-title">{story.title}</div>
            <p className="alert-desc small">{story.detail}</p>
            <div className="small">Mercadería involucrada: <span className="alert-impact">{fmtUnits(story.units)} · {formatUsd(story.usd)}</span></div>
            <div className="what-next"><strong>Qué hacer:</strong> {story.next}</div>
            {a.status === 'NEW' && <button type="button" className="btn btn-small" onClick={() => actions.setAlertInReview(a.id)}>Marcar en revisión</button>}
            <details>
              <summary>Ver evidencia técnica</summary>
              <div className="evidence small">
                {disc && (
                  <dl className="kv">
                    <dt>Discrepancia</dt><dd><code>{disc.id}</code> · pendiente de verificación</dd>
                    <dt>Registrada</dt><dd>{placeName(state, disc.expectedLocationId)}</dd>
                    <dt>Leída en</dt><dd>{disc.observedLocationId ? placeName(state, disc.observedLocationId) : 'Sin lectura'}</dd>
                    <dt>Alerta</dt><dd><code>{a.id}</code></dd>
                  </dl>
                )}
                {events.map((e) => (
                  <div key={e.id} className="evidence-item">
                    <span className="source-tag">{e.source}</span> {eventSourceLabel(e)} · <code>{e.id}</code>
                    <div className="muted">Captura {e.capturedAt} · recibida {e.receivedAt}</div>
                    <div>{e.evidenceNote}</div>
                  </div>
                ))}
              </div>
            </details>
          </article>
        );
      })}
      {verifyRecs.length > 0 && <h3>Acción propuesta</h3>}
      {verifyRecs.map((r) => (
        <RecommendationCard key={r.id} rec={r} task={state.tasks.find((t) => t.recommendationId === r.id)} actions={actions} />
      ))}

      <details>
        <summary>Escenarios de simulación</summary>
        <div className="scenario-list">
          {SCENARIOS.map((s) => {
            const done = s.events.every((e) => state.events.some((x) => x.id === e.id));
            return (
              <div key={s.id} className="scenario small">
                <div><strong>{s.title}</strong><div className="muted">{s.description}</div></div>
                <button type="button" className="btn btn-small" onClick={() => actions.runScenario(s.id)}>{done ? 'Reenviar (idempotente)' : 'Ejecutar'}</button>
              </div>
            );
          })}
        </div>
      </details>
      <details className="audit">
        <summary>Bitácora ({state.audit.length})</summary>
        <ol className="small">{state.audit.map((a) => <li key={a.seq}>{a.message}</li>)}</ol>
      </details>
    </div>
  );
}
