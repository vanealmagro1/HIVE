// Panel contextual (solo el paso actual), barra de 6 pasos y drawer de detalle técnico.
import {
  ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardCheck, Clock, Lightbulb, MapPin, RotateCcw, ScanLine,
  TrendingUp, TriangleAlert, Truck, Warehouse, X,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { formatNumber, formatUsd } from '../../domain/format';
import { receiptShortage } from '../../engine/receiving';
import { getScenario } from '../../engine/scenarios';
import { computeAnalytics, type DemoState } from '../../store/demoState';
import {
  alertStory, COUNT_SCENARIO_ID, DEMO_EVENT_ID, DEMO_RECOMMENDATION_ID, DEMO_UNIT_ID, demoSteps, eventSourceLabel,
  RECEIPT_SCENARIO_ID, unitContents,
} from '../../store/selectors';
import type { Actions } from '../actions';
import AlertsPanel from '../panels/AlertsPanel';
import AnalyticsPanel from '../panels/AnalyticsPanel';
import RecommendationCard from '../panels/RecommendationCard';
import RfidPanel from '../panels/RfidPanel';
import { productIcon } from './Shell';

const HERO_SKU = 'MOC-001';

function ProductRow({ title, sub, skuId, badge }: { title: string; sub: string; skuId: string | null; badge?: string }) {
  const Icon = productIcon(skuId);
  return (
    <div className="product-row" data-testid="product-row">
      <span className="product-icon"><Icon size={22} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="product-name">{title}</div>
        <div className="product-sub">{sub}</div>
      </div>
      {badge && <span className="ref-badge">{badge}</span>}
    </div>
  );
}

function Fact({ value, label, tone }: { value: string; label: string; tone?: 'warn' | 'good' }) {
  return <div className={`fact${tone ? ` ${tone}` : ''}`}><div className="fact-value">{value}</div><div className="fact-label">{label}</div></div>;
}

function Title({ icon, children, tone = 'var(--purple)' }: { icon: ReactNode; children: ReactNode; tone?: string }) {
  return <div className="step-title" style={{ color: 'var(--text)' }}><span style={{ color: tone, display: 'grid' }}>{icon}</span>{children}</div>;
}

export function StepPanel({ state, actions }: { state: DemoState; actions: Actions }) {
  const step = state.ui.step;
  const po = state.purchaseOrders[0];
  const playing = state.ui.playback;
  const pallet = state.units.find((u) => u.id === DEMO_UNIT_ID)!;
  const palletInfo = unitContents(state, pallet);
  const detected = state.events.some((e) => e.id === DEMO_EVENT_ID) && playing !== COUNT_SCENARIO_ID;
  const a = computeAnalytics(state).find((x) => x.skuId === HERO_SKU);
  const rec = state.recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID);
  const task = state.tasks.find((t) => t.recommendationId === DEMO_RECOMMENDATION_ID);
  const next = <button type="button" className="btn btn-primary" onClick={actions.nextStep}>Siguiente <ArrowRight size={18} /></button>;
  const detail = (label = 'Ver detalle') => <button type="button" className="btn" onClick={actions.openDrawer}>{label}</button>;

  let body: ReactNode = null;
  if (step === 0) {
    const sku = state.skus.find((k) => k.id === po.skuId);
    const sh = receiptShortage(state, po);
    const expectedUnits = po.boxes.reduce((t, b) => t + b.qty, 0);
    const receivedUnits = expectedUnits - sh.units;
    const reading = playing === RECEIPT_SCENARIO_ID;
    body = (
      <>
        <Title icon={<Warehouse size={30} />}>Tu bodega, en tiempo real</Title>
        <p className="step-desc">Llega un camión: el portal RFID lee cada caja al pasar.</p>
        <ProductRow title={sku?.name || po.skuId} sub={`${po.skuId} · ${po.id}`} skuId={po.skuId} badge={`${po.boxes.length} cajas`} />
        {po.status === 'EXPECTED' && !reading && <div className="note">Inventario actual registrado; el gemelo muestra cada ubicación.</div>}
        {(reading || po.status === 'RECEIVING') && (
          <div data-testid="receipt-progress">
            <div className="counter-line"><span className="counter">{po.receivedBoxIds.length}</span><span className="muted">de {po.boxes.length} cajas leídas</span></div>
            <div className="bar"><span style={{ width: `${(po.receivedBoxIds.length / po.boxes.length) * 100}%` }} /></div>
          </div>
        )}
        {po.status === 'CLOSED' && (
          <>
            <div className="facts" data-testid="receipt-result">
              <Fact value={`${po.boxes.length}`} label={`esperadas · ${formatNumber(expectedUnits)} u`} />
              <Fact value={`${po.receivedBoxIds.length}`} label={`detectadas · ${formatNumber(receivedUnits)} u`} tone="good" />
              <Fact value={`${sh.missing.length}`} label={`faltante · ${formatNumber(sh.units)} u`} tone={sh.missing.length ? 'warn' : undefined} />
            </div>
            {sh.missing.length > 0 && <span className="status-chip pending"><TriangleAlert size={14} /> Faltante en recepción · {formatUsd(sh.usd)}</span>}
          </>
        )}
        <div className="panel-actions">
          {po.status !== 'CLOSED'
            ? <button type="button" className="btn btn-primary" onClick={actions.startReception} disabled={!!playing}>
                <Truck size={18} /> {reading ? 'Leyendo etiquetas…' : 'Recibir camión'}
              </button>
            : next}
          {detail('Ver lecturas RFID')}
        </div>
      </>
    );
  } else if (step === 1) {
    const ev = state.events.find((e) => e.id === DEMO_EVENT_ID);
    const counting = playing === COUNT_SCENARIO_ID;
    const total = getScenario(COUNT_SCENARIO_ID).events.length;
    const done = getScenario(COUNT_SCENARIO_ID).events.filter((e) => state.events.some((x) => x.id === e.id)).length;
    body = (
      <>
        <Title icon={<ScanLine size={30} />}>Movimiento detectado</Title>
        <p className="step-desc">Un operario recorre el pasillo D con un lector de mano RFID.</p>
        {!detected ? (
          <>
            {counting && (
              <div>
                <div className="counter-line"><span className="counter">{done}</span><span className="muted">de {total} etiquetas</span></div>
                <div className="bar"><span style={{ width: `${(done / total) * 100}%` }} /></div>
              </div>
            )}
            <div className="panel-actions">
              <button type="button" className="btn btn-primary" onClick={actions.runDemoEvent} disabled={!!playing}>
                <ScanLine size={18} /> {counting ? 'Leyendo…' : 'Contar pasillo D'}
              </button>
            </div>
          </>
        ) : (
          <>
            <ProductRow title={palletInfo.title} sub={palletInfo.subtitle} skuId={palletInfo.skuId} badge={pallet.id} />
            <div className="loc-box detected" data-testid="new-evidence">
              <div className="loc-label">Nueva evidencia</div>
              <div className="loc-value"><MapPin size={16} /> {ev?.locationHintId}</div>
            </div>
            <span className="status-chip info"><Clock size={14} /> {ev?.capturedAt.slice(11, 19)} · {ev ? eventSourceLabel(ev) : ''}</span>
            <div className="panel-actions">{next}{detail('Ver evento')}</div>
          </>
        )}
      </>
    );
  } else if (step === 2) {
    const alert = state.alerts.find((x) => x.type === 'LOCATION_MISMATCH');
    const story = alert ? alertStory(state, alert) : null;
    body = story ? (
      <>
        <Title icon={<TriangleAlert size={30} />} tone="var(--warning)">{story.heading}</Title>
        <ProductRow title={story.product} sub={story.refLine.split(' · ')[0]} skuId={palletInfo.skuId} badge={pallet.id} />
        <div className="loc-compare" data-testid="loc-compare">
          <div className="loc-box"><div className="loc-label">Ubicación esperada</div><div className="loc-value"><MapPin size={16} /> {story.expected}</div></div>
          <ArrowRight size={20} aria-hidden />
          <div className="loc-box detected"><div className="loc-label">{story.detectedIsZone ? 'Zona detectada' : 'Ubicación detectada'}</div><div className="loc-value"><MapPin size={16} /> {story.detected}</div></div>
        </div>
        <span className="status-chip pending"><Clock size={14} /> Pendiente de verificación</span>
        <div className="panel-actions"><button type="button" className="btn btn-primary" onClick={actions.openDrawer}>Ver detalle</button></div>
      </>
    ) : (
      <>
        <Title icon={<TriangleAlert size={30} />} tone="var(--warning)">Ubicación por verificar</Title>
        <p className="note">Aún no hay evidencia de movimiento.</p>
        <div className="panel-actions"><button type="button" className="btn btn-primary" onClick={() => actions.goStep(1)}>Volver al paso 2</button></div>
      </>
    );
  } else if (step === 3 && a) {
    body = (
      <>
        <Title icon={<TrendingUp size={30} />}>Impacto identificado</Title>
        <ProductRow title={a.skuName} sub={`${a.skuId} · ${formatNumber(a.stock)} unidades · ${formatNumber(a.dailyDemand ?? 0)}/día`} skuId={a.skuId} />
        <div className="facts" data-testid="impact-facts">
          <Fact value={`${formatNumber(a.coverageDays ?? 0)} días`} label="cobertura" />
          <Fact value={formatNumber(a.excessUnits ?? 0)} label="unidades excedentes" tone="warn" />
          <Fact value={formatUsd(a.excessExposureUsd ?? 0)} label="exposición estimada" tone="warn" />
        </div>
        <p className="note">Escenario de sobrestock con objetivo de {a.targetCoverageDays} días. Es un análisis independiente del pallet en revisión.</p>
        <div className="panel-actions">{next}{detail('Ver cálculo')}</div>
      </>
    );
  } else if (step === 4 && rec && a) {
    body = (
      <>
        <Title icon={<Lightbulb size={30} />}>Acción recomendada</Title>
        <ProductRow title={a.skuName} sub={`${a.skuId} · ${formatNumber(a.stock)} unidades`} skuId={a.skuId} />
        <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--purple-line)', background: 'var(--purple-soft)' }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 750 }} data-testid="rec-title">{rec.title}</div>
          <div className="note">Cobertura de {formatNumber(a.coverageDays ?? 0)} días frente a {a.targetCoverageDays} · {formatUsd(rec.estimatedImpactUsd ?? 0)} estimados</div>
        </div>
        {rec.status === 'APPROVED' && <span className="status-chip ok"><Check size={14} /> Aprobada</span>}
        <div className="panel-actions">
          {rec.status === 'PROPOSED'
            ? <button type="button" className="btn btn-primary" onClick={() => actions.approve(rec.id)}>Aprobar acción</button>
            : next}
          {detail('Ver supuestos')}
        </div>
      </>
    );
  } else if (step === 5) {
    const audit = [...state.audit].reverse().find((x) => x.message.includes(DEMO_RECOMMENDATION_ID));
    body = task && rec && a ? (
      <>
        <Title icon={<ClipboardCheck size={30} />} tone="var(--success)">Acción registrada</Title>
        <ProductRow title={a.skuName} sub={`${a.skuId} · ${rec.title}`} skuId={a.skuId} />
        <dl className="kv" style={{ margin: 0 }} data-testid="task-summary">
          <dt>Tarea</dt><dd><strong>{task.id}</strong></dd>
          <dt>Responsable</dt><dd>{task.owner}</dd>
          <dt>Estado</dt><dd><span className="status-chip pending">Pendiente de ejecución</span></dd>
          <dt>Auditoría</dt><dd>#{audit?.seq ?? '—'}</dd>
        </dl>
        <p className="note">La aprobación crea la tarea; el movimiento físico aún no se ha ejecutado.</p>
        <div className="panel-actions">{detail()}</div>
      </>
    ) : (
      <>
        <Title icon={<ClipboardCheck size={30} />}>Acción registrada</Title>
        <span className="status-chip pending"><Clock size={14} /> Acción pendiente de aprobación</span>
        <div className="panel-actions"><button type="button" className="btn btn-primary" onClick={() => actions.goStep(4)}>Volver al paso 5</button></div>
      </>
    );
  }

  return (
    <section className="card step-panel" aria-label="Paso actual" data-testid="step-panel">
      <div className="step-head">
        <h2>Paso {step + 1} de 6</h2>
        <div className="nav-arrows">
          <button type="button" className="round-btn" onClick={actions.prevStep} disabled={step === 0} aria-label="Paso anterior"><ChevronLeft size={18} /></button>
          <button type="button" className="round-btn" onClick={actions.nextStep} disabled={step === 5} aria-label="Paso siguiente"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="progress6" aria-hidden>{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
      {body}
    </section>
  );
}

export function StepBar({ state, actions }: { state: DemoState; actions: Actions }) {
  const steps = demoSteps(state);
  return (
    <nav className="stepbar" aria-label="Recorrido de la demo">
      {steps.map((s, i) => {
        const current = state.ui.step === i;
        return (
          <button key={s.id} type="button" className={`stepbar-item${current ? ' is-current' : ''}${s.done ? ' is-done' : ''}`}
            onClick={() => actions.goStep(i)} aria-current={current ? 'step' : undefined} aria-label={`${i + 1} · ${s.title}`}>
            <span className="step-circle">{s.done && !current ? <Check size={16} strokeWidth={3} /> : i + 1}</span>
            <span className="step-name">{s.title}</span>
            <span className="step-sub">{s.subtitle}</span>
          </button>
        );
      })}
      <button type="button" className="btn btn-ghost reset-btn" onClick={actions.reset} title="Reiniciar demo" aria-label="Reiniciar demo">
        <RotateCcw size={18} />
      </button>
    </nav>
  );
}

/** Detalle técnico del paso actual: evidencia, procedencia, fórmulas y auditoría. */
export function DetailDrawer({ state, actions }: { state: DemoState; actions: Actions }) {
  useEffect(() => {
    if (!state.ui.drawer) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.ui.drawer, actions]);
  if (!state.ui.drawer) return null;
  const step = state.ui.step;
  const ev = state.events.find((e) => e.id === DEMO_EVENT_ID);
  const rec = state.recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID);
  const titles = ['Recepción RFID', 'Evidencia del evento', 'Alertas y evidencia', 'Cálculo del impacto', 'Recomendación', 'Registro y auditoría'];
  let body: ReactNode;
  if (step === 0) body = <RfidPanel state={state} actions={actions} />;
  else if (step === 1) body = ev ? (
    <dl className="kv">
      <dt>Evento</dt><dd><code>{ev.id}</code></dd>
      <dt>Procedencia</dt><dd><span className="source-tag">{ev.source}</span> {eventSourceLabel(ev)}</dd>
      <dt>Lector</dt><dd>{ev.readerId ?? '—'}</dd>
      <dt>Captura</dt><dd>{ev.capturedAt}</dd>
      <dt>Recepción</dt><dd>{ev.receivedAt}</dd>
      <dt>Unidad</dt><dd>{ev.unitId}</dd>
      <dt>Evidencia</dt><dd>{ev.locationHintId}</dd>
      <dt>Nota</dt><dd className="small">{ev.evidenceNote}</dd>
    </dl>
  ) : <p className="muted">Aún no hay evento.</p>;
  else if (step === 2) body = <AlertsPanel state={state} actions={actions} />;
  else if (step === 3) body = <AnalyticsPanel state={state} actions={actions} />;
  else body = (
    <>
      {rec && <RecommendationCard rec={rec} task={state.tasks.find((t) => t.recommendationId === rec.id)} actions={actions} showAssumptions />}
      <h3>Bitácora</h3>
      <ol className="small">{state.audit.map((x) => <li key={x.seq}>#{x.seq} · {x.message}</li>)}</ol>
    </>
  );
  return (
    <>
      <div className="drawer-backdrop" onClick={actions.closeDrawer} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={titles[step]} data-testid="detail-drawer">
        <div className="drawer-head">
          <h2>{titles[step]}</h2>
          <button type="button" className="round-btn" style={{ marginLeft: 'auto' }} onClick={actions.closeDrawer} aria-label="Cerrar detalle"><X size={18} /></button>
        </div>
        <div className="drawer-body">{body}</div>
      </aside>
    </>
  );
}
