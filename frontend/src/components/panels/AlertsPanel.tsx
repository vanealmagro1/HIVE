import { SCENARIOS } from '../../engine/scenarios';
import type { DemoState } from '../../store/demoState';
import { describeLocation, PRIORITY_LABEL } from '../../store/selectors';
import type { Actions } from '../actions';
import RecommendationCard from './RecommendationCard';

const ALERT_STATUS: Record<string, string> = { NEW: 'NUEVA', IN_REVIEW: 'EN REVISIÓN', RESOLVED: 'RESUELTA' };

export default function AlertsPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const verifyRecs = state.recommendations.filter((r) => r.type === 'VERIFY_LOCATION');
  return (
    <div data-testid="alerts-panel">
      <h2>Alertas y conciliación</h2>
      {state.alerts.length === 0 && (
        <p className="muted">Sin alertas. Ejecute el evento simulado para generar evidencia.</p>
      )}
      {state.alerts.map((a) => {
        const disc = state.discrepancies.find((d) => d.unitId === a.unitId && d.kind === a.type);
        const events = state.events.filter((e) => a.evidenceEventIds.includes(e.id));
        return (
          <article key={a.id} className={`alert-card prio-${a.priority}`} data-testid={`alert-${a.id}`}>
            <div className="alert-head">
              <span className={`prio prio-tag-${a.priority}`}>▲ PRIORIDAD {PRIORITY_LABEL[a.priority]}</span>
              <span className="pill">{ALERT_STATUS[a.status]}</span>
              <code>{a.id}</code>
            </div>
            <p className="alert-desc">{a.description}</p>
            {disc && (
              <dl className="kv small">
                <dt>Discrepancia</dt><dd><code>{disc.id}</code> · <strong>PENDIENTE DE VERIFICACIÓN</strong></dd>
                <dt>Esperada</dt><dd>{describeLocation(state, disc.expectedLocationId)}</dd>
                <dt>Observada</dt><dd>{disc.observedLocationId ? describeLocation(state, disc.observedLocationId) : 'Sin lectura'}</dd>
              </dl>
            )}
            <div className="evidence">
              <strong className="small">Evidencia</strong>
              {events.map((e) => (
                <div key={e.id} className="small evidence-item">
                  <span className="source-tag">{e.source}</span> <code>{e.id}</code> · escenario {e.scenarioId}
                  <div className="muted">Captura {e.capturedAt} · recepción {e.receivedAt}</div>
                  <div>{e.evidenceNote}</div>
                </div>
              ))}
            </div>
            <p className="muted small">No se declara traslado ni pérdida: la ubicación esperada y el stock no cambian hasta una verificación humana.</p>
            {a.status === 'NEW' && <button type="button" className="btn" onClick={() => actions.setAlertInReview(a.id)}>Marcar en revisión</button>}
          </article>
        );
      })}
      {verifyRecs.length > 0 && <h3>Acción propuesta</h3>}
      {verifyRecs.map((r) => (
        <RecommendationCard key={r.id} rec={r} task={state.tasks.find((t) => t.recommendationId === r.id)} actions={actions} />
      ))}

      <h3>Simulador (escenarios deterministas)</h3>
      <div className="scenario-list">
        {SCENARIOS.map((s) => {
          const done = s.events.every((e) => state.events.some((x) => x.id === e.id));
          return (
            <div key={s.id} className="scenario">
              <div><code>{s.id}</code> · {s.title}<div className="muted small">{s.description}</div></div>
              <button type="button" className="btn btn-small" onClick={() => actions.runScenario(s.id)}>{done ? 'Reenviar (idempotente)' : 'Ejecutar'}</button>
            </div>
          );
        })}
      </div>

      <details className="audit">
        <summary>Bitácora ({state.audit.length})</summary>
        <ol className="small">{state.audit.map((a) => <li key={a.seq}>{a.message}</li>)}</ol>
      </details>
    </div>
  );
}
