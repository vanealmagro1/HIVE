import { useEffect, useRef } from 'react';
import { formatUsd } from '../../domain/format';
import type { Recommendation, Task } from '../../domain/types';
import type { Actions } from '../actions';

const STATUS_TEXT: Record<Recommendation['status'], string> = {
  PROPOSED: 'PROPUESTA', APPROVED: 'APROBADA', REJECTED: 'RECHAZADA',
};

export default function RecommendationCard({ rec, task, actions, showAssumptions = false }: {
  rec: Recommendation; task: Task | undefined; actions: Actions; showAssumptions?: boolean;
}) {
  const taskRef = useRef<HTMLDivElement>(null);
  // Al crearse la tarea, asegurar que quede visible en el panel (presentación en 1366x768).
  useEffect(() => { taskRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [task?.id]);
  return (
    <div className={`rec-card rec-${rec.status}`} data-testid={`rec-${rec.id}`}>
      <div className="rec-head">
        <span className="eyebrow">Recomendación</span>
        <span className={`pill pill-${rec.status}`}>{STATUS_TEXT[rec.status]}</span>
      </div>
      <div className="rec-title">{rec.title}</div>
      <div className="small">{rec.reason}</div>
      {rec.estimatedImpactUsd !== null && (
        <div className="small"><strong>Impacto estimado: {formatUsd(rec.estimatedImpactUsd)}</strong> <span className="muted">(estimación, no ahorro realizado)</span></div>
      )}
      {rec.status === 'PROPOSED' && (
        <div className="rec-actions">
          <button type="button" className="btn btn-primary" onClick={() => actions.approve(rec.id)}>Aprobar</button>
          <button type="button" className="btn" onClick={() => actions.reject(rec.id)}>Rechazar</button>
        </div>
      )}
      {task && (
        <div className="task-line" ref={taskRef} data-testid={`task-${task.id}`}>
          ✔ Tarea creada · {task.status === 'OPEN' ? 'ABIERTA' : 'HECHA'} · Responsable: {task.owner}
          <div className="muted small">El inventario y el ERP no se modifican: la tarea la ejecuta el equipo.</div>
        </div>
      )}
      <details>
        <summary>{showAssumptions ? 'Supuestos y detalle técnico' : 'Detalle técnico'}</summary>
        <div className="small"><code>{rec.id}</code>{task && <> · <code>{task.id}</code></>}</div>
        {showAssumptions && <ul className="small">{rec.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
      </details>
    </div>
  );
}
