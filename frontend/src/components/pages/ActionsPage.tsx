// Acciones: aprobar recomendaciones y verificar el resultado de las transferencias (ejecución simulada).
import { ArrowRight, Check, Forklift, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { formatNumber, formatUsd } from '../../domain/format';
import type { Movement, Recommendation, Task } from '../../domain/types';
import { planTransfer, siteName, transferCandidates, transferComparison, type TransferComparison } from '../../engine/transfers';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import type { Actions } from '../actions';
import { Chip, PageHead, warehouseLabel } from '../layout/Shell';

const TYPE_CHIP: Record<Recommendation['type'], { label: string; tone: 'warn' | 'bad' | 'info' }> = {
  REVIEW_EXCESS: { label: 'Sobrestock', tone: 'warn' },
  PRIORITIZE_FEFO: { label: 'Vencimiento', tone: 'bad' },
  VERIFY_LOCATION: { label: 'Ubicación', tone: 'info' },
  CLAIM_SHORTAGE: { label: 'Faltante', tone: 'bad' },
};
const MOVEMENT: Record<Movement['status'], { label: string; tone: 'sim' | 'info' | 'ok' }> = {
  PLANNED: { label: 'Pendiente de ejecución', tone: 'sim' },
  IN_PROGRESS: { label: 'En ejecución', tone: 'info' },
  COMPLETED: { label: 'Completado en simulación', tone: 'ok' },
};
const short = (name: string) => name.replace(' (simulada)', '').replace(/^Bodega /, '');
const days = (v: number | null) => (v === null ? '—' : `${formatNumber(v, Number.isInteger(v) ? 0 : 1)} d`);

function BeforeAfter({ c }: { c: TransferComparison }) {
  const row = (label: string, f: (x: TransferComparison['origin']['before']) => string) => (
    <tr>
      <th scope="row">{label}</th>
      <td>{f(c.origin.before)}</td><td className="ba-after">{f(c.origin.after)}</td>
      <td>{f(c.destination.before)}</td><td className="ba-after">{f(c.destination.after)}</td>
    </tr>
  );
  return (
    <div data-testid="before-after">
      <table className="ba-table">
        <thead>
          <tr><th /><th colSpan={2}>{short(c.origin.before.name)}</th><th colSpan={2}>{short(c.destination.before.name)}</th></tr>
          <tr className="ba-sub"><th /><th>Antes</th><th>{c.confirmed ? 'Después' : 'Previsto'}</th><th>Antes</th><th>{c.confirmed ? 'Después' : 'Previsto'}</th></tr>
        </thead>
        <tbody>
          {row('Stock', (x) => `${formatNumber(x.stock)} u`)}
          {row('Cobertura', (x) => days(x.coverageDays))}
          {row('Exposición', (x) => formatUsd(x.exposureUsd))}
        </tbody>
      </table>
      <div className="ba-total" data-testid="ba-total">
        Total entre bodegas: <strong>{formatNumber(c.totalBefore)} u → {formatNumber(c.totalAfter)} u</strong>
        {c.totalBefore === c.totalAfter && <span className="muted"> · se conserva (traslado interno, no venta)</span>}
      </div>
    </div>
  );
}

function RecCard({ state, actions, rec, onTask }: { state: DemoState; actions: Actions; rec: Recommendation; onTask: () => void }) {
  const a = rec.skuId ? computeAnalytics(state).find((x) => x.skuId === rec.skuId) : undefined;
  const skuName = a?.skuName ?? rec.skuId ?? '';
  const chip = TYPE_CHIP[rec.type];
  const m = state.movements.find((x) => x.recommendationId === rec.id);
  const plan = rec.type === 'REVIEW_EXCESS' && rec.skuId && !m ? planTransfer(state, rec.skuId, rec.quantity ?? 0) : null;
  const dest = rec.type === 'REVIEW_EXCESS' && rec.skuId ? transferCandidates(state, rec.skuId)[0] : undefined;
  const pallets = m?.unitIds ?? (plan?.ok ? plan.unitIds : []);
  const origins = m?.originLocationIds ?? (plan?.ok ? plan.originLocationIds : []);
  const firstUnit = pallets[0] ?? rec.unitId;
  const city = warehouseLabel(state).split(' · ')[0];

  return (
    <article className="card rec" data-testid={`rec-${rec.id}`}>
      <div className="rec-top">
        <div>
          <h2 className="card-title">{rec.type === 'REVIEW_EXCESS' ? `Redistribuir ${skuName}` : rec.title}</h2>
          <p className="card-sub">{rec.skuId ?? rec.unitId ?? ''} · {rec.type === 'REVIEW_EXCESS' ? 'Transferencia entre bodegas' : chip.label}</p>
        </div>
        {rec.status === 'PROPOSED' ? <Chip tone={chip.tone}>{chip.label}</Chip>
          : rec.status === 'APPROVED' ? <Chip tone="ok"><Check size={12} /> Aprobada</Chip> : <Chip tone="sim">Rechazada</Chip>}
      </div>
      <p style={{ margin: 0 }}>
        {rec.type === 'REVIEW_EXCESS' && a && dest
          ? `${city} tiene ${formatNumber(a.coverageDays ?? 0)} días de cobertura frente a un objetivo de ${a.targetCoverageDays}. ${short(dest.site.name)} tiene ${formatNumber(dest.coverageDays, 1)} días de cobertura.`
          : rec.reason}
      </p>
      {rec.type === 'REVIEW_EXCESS' ? (
        <dl className="rec-grid">
          <div><dt>Cantidad sugerida</dt><dd>{formatNumber(rec.quantity ?? 0)} unidades</dd></div>
          <div><dt>Origen</dt><dd>{city} · {origins.join(' · ') || '—'}</dd></div>
          <div><dt>Destino</dt><dd>{dest ? `${short(dest.site.name)} · ${dest.site.dockName}` : m ? short(siteName(state, m.toWarehouseId)) : '—'}</dd></div>
          <div><dt>Unidad logística</dt><dd>{pallets.join(' · ') || '—'}</dd></div>
        </dl>
      ) : rec.estimatedImpactUsd !== null && (
        <dl className="rec-grid"><div><dt>Impacto estimado</dt><dd>{formatUsd(rec.estimatedImpactUsd)}</dd></div></dl>
      )}
      <div className="rec-btns">
        {rec.status === 'PROPOSED' && <button type="button" className="btn btn-primary" onClick={() => actions.approve(rec.id)}>Aprobar recomendación</button>}
        {rec.status === 'APPROVED' && <button type="button" className="btn btn-primary" onClick={onTask}>Ver tarea <ArrowRight size={15} /></button>}
        {firstUnit && <button type="button" className="btn" onClick={() => actions.locateUnit(firstUnit)}>Ver pallet de origen</button>}
        {rec.skuId && <button type="button" className="btn" onClick={() => { actions.setSku(rec.skuId!); actions.setSection('analitica'); }}>Ver analítica</button>}
        {rec.status === 'PROPOSED' && <button type="button" className="btn btn-ghost" onClick={() => actions.reject(rec.id)}>Rechazar</button>}
      </div>
    </article>
  );
}

function TaskCard({ state, actions, task }: { state: DemoState; actions: Actions; task: Task }) {
  const m = state.movements.find((x) => x.taskId === task.id || x.recommendationId === task.recommendationId);
  const c = m ? transferComparison(state, m) : null;
  const st = m ? MOVEMENT[m.status] : { label: task.status === 'DONE' ? 'Completada' : 'Pendiente', tone: 'sim' as const };
  return (
    <article className="card rec" data-testid={`task-${task.id}`}>
      <div className="rec-top">
        <div><h2 className="card-title">{task.title}</h2><p className="card-sub">{task.id} · Responsable: {task.owner}</p></div>
        <Chip tone={st.tone}>{st.label}</Chip>
      </div>
      {m ? (
        <>
          <dl className="rec-grid">
            <div><dt>Origen</dt><dd>{short(siteName(state, m.fromWarehouseId))} · {m.originLocationIds.join(' · ')}</dd></div>
            <div><dt>Destino</dt><dd>{short(siteName(state, m.toWarehouseId))}</dd></div>
            <div><dt>Cantidad</dt><dd>{formatNumber(m.quantity)} u · {m.unitIds.length} pallets</dd></div>
            <div><dt>Unidades logísticas</dt><dd>{m.unitIds.join(' · ')}</dd></div>
          </dl>
          {c && <BeforeAfter c={c} />}
          <p className="note" style={{ margin: 0 }}>
            {m.status === 'PLANNED' && 'Aprobar no mueve inventario: el traslado se simula y se confirma en destino.'}
            {m.status === 'IN_PROGRESS' && 'Los pallets van hacia el muelle. El inventario cambia solo cuando el destino confirma lo recibido.'}
            {m.status === 'COMPLETED' && 'Traslado confirmado: ambas bodegas quedan en su cobertura objetivo (sin ajuste ERP).'}
          </p>
          <div className="rec-btns">
            {m.status === 'PLANNED' && <button type="button" className="btn btn-primary" onClick={() => actions.simulateExecution(m.id)}><Forklift size={16} /> Simular ejecución</button>}
            {m.status === 'IN_PROGRESS' && <button type="button" className="btn btn-primary" onClick={() => actions.confirmReception(m.id)}><PackageCheck size={16} /> Confirmar recepción · {formatNumber(m.quantity)} u</button>}
            {m.unitIds[0] && m.status !== 'COMPLETED' && <button type="button" className="btn" onClick={() => actions.locateUnit(m.unitIds[0])}>Ver en gemelo</button>}
          </div>
        </>
      ) : (
        <p className="note" style={{ margin: 0 }}>Tarea registrada para seguimiento. No mueve inventario.</p>
      )}
    </article>
  );
}

export default function ActionsPage({ state, actions }: { state: DemoState; actions: Actions }) {
  const [tab, setTab] = useState<'recs' | 'tasks'>('recs');
  const recs = state.recommendations.filter((r) => r.type !== 'VERIFY_LOCATION')
    .sort((a, b) => (b.estimatedImpactUsd ?? 0) - (a.estimatedImpactUsd ?? 0));
  const proposed = recs.filter((r) => r.status === 'PROPOSED').length;
  return (
    <div className="page" data-testid="page-acciones">
      <PageHead state={state} title="Acciones" sub="Aprueba recomendaciones y verifica el resultado de las transferencias." />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'recs'} className={tab === 'recs' ? 'is-on' : ''} onClick={() => setTab('recs')}>
          Recomendaciones{proposed > 0 && <span className="tab-count">{proposed}</span>}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'is-on' : ''} onClick={() => setTab('tasks')}>
          Tareas{state.tasks.length > 0 && <span className="tab-count">{state.tasks.length}</span>}
        </button>
      </div>
      <div className="list-stack">
        {tab === 'recs'
          ? (recs.length ? recs.map((r) => <RecCard key={r.id} state={state} actions={actions} rec={r} onTask={() => setTab('tasks')} />)
            : <p className="card empty">No hay recomendaciones.</p>)
          : (state.tasks.length ? [...state.tasks].reverse().map((t) => <TaskCard key={t.id} state={state} actions={actions} task={t} />)
            : <p className="card empty">Las tareas aparecen al aprobar una recomendación.</p>)}
      </div>
    </div>
  );
}
