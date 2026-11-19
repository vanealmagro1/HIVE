// Estructura principal: sidebar, header y tarjetas KPI (todas conectadas al estado).
import {
  Backpack, Bell, Box, Boxes, Cable, Calculator, ChartColumn, ChevronDown, FileText, Gauge, Hexagon, House, Keyboard,
  Layers, Mouse, NotebookPen, Package, Palette, Paperclip, PenLine, Printer, RadioTower, TrendingUp, TriangleAlert,
  Warehouse, type LucideIcon,
} from 'lucide-react';
import { computeAnalytics, type DemoState, type Section } from '../../store/demoState';
import { formatNumber, formatUsd } from '../../domain/format';
import { kpis } from '../../store/selectors';
import type { Actions } from '../actions';

const NAV: { section: Section; label: string; icon: LucideIcon }[] = [
  { section: 'resumen', label: 'Resumen', icon: House },
  { section: 'inventario', label: 'Inventario', icon: Package },
  { section: 'gemelo', label: 'Gemelo digital', icon: Layers },
  { section: 'eventos', label: 'Eventos', icon: RadioTower },
  { section: 'analitica', label: 'Analítica', icon: ChartColumn },
  { section: 'reportes', label: 'Reportes', icon: FileText },
];

/** Ícono por familia de producto (prefijo del SKU). Pallet mixto → Boxes. */
const FAMILY_ICON: Record<string, LucideIcon> = {
  MOC: Backpack, UTI: Backpack, CUA: NotebookPen, ESC: PenLine, ART: Palette, COL: Palette,
  TEC: Mouse, ACC: Cable, CAL: Calculator, RES: FileText, OFI: Paperclip, TIN: Printer,
};
export function productIcon(skuId: string | null): LucideIcon {
  if (!skuId) return Boxes;
  return FAMILY_ICON[skuId.slice(0, 3)] ?? (skuId.startsWith('TEC') ? Keyboard : Box);
}

export function Sidebar({ state, actions }: { state: DemoState; actions: Actions }) {
  const open = state.alerts.filter((a) => a.status !== 'RESOLVED').length;
  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="logo"><span className="logo-mark" aria-hidden><Hexagon size={22} strokeWidth={2.4} /></span><span>HIVE</span></div>
      <nav className="nav">
        {NAV.map(({ section, label, icon: Icon }) => (
          <button
            key={section}
            type="button"
            className={`nav-item${state.ui.section === section ? ' is-active' : ''}`}
            aria-current={state.ui.section === section ? 'page' : undefined}
            onClick={() => actions.setSection(section)}
            title={label}
          >
            <Icon size={20} aria-hidden /> <span>{label}</span>
            {section === 'eventos' && open > 0 && <span className="nav-badge">{open}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <Warehouse size={22} aria-hidden />
        <div><strong>{state.warehouse.name.replace(' (simulada)', '')}</strong><span className="dot" />Operativa</div>
      </div>
    </aside>
  );
}

export function Header({ state, actions }: { state: DemoState; actions: Actions }) {
  const open = state.alerts.filter((a) => a.status !== 'RESOLVED').length;
  return (
    <header className="header">
      <button type="button" className="wh-select" disabled title="Una bodega en esta demo">
        {state.warehouse.name.replace(' (simulada)', '')} <ChevronDown size={18} aria-hidden />
      </button>
      <div className="header-right">
        <span className="pill-demo" data-testid="sim-banner">Demo simulada</span>
        <button type="button" className="icon-btn" aria-label={`Alertas activas: ${open}`} onClick={() => actions.setSection('eventos')}>
          <Bell size={18} />{open > 0 && <span className="count">{open}</span>}
        </button>
        <span className="avatar" aria-label="Perfil de usuario">VA</span>
      </div>
    </header>
  );
}

export function KpiCards({ state }: { state: DemoState }) {
  const k = kpis(state, computeAnalytics(state));
  return (
    <section className="kpis" aria-label="Indicadores">
      <div className="kpi"><span className="kpi-icon purple"><Package size={24} /></span>
        <div><div className="kpi-value" data-testid="kpi-units">{formatNumber(k.units)}</div><div className="kpi-label">Unidades</div></div></div>
      <div className="kpi"><span className="kpi-icon red"><TriangleAlert size={24} /></span>
        <div><div className="kpi-value" data-testid="kpi-alerts">{k.alerts}</div><div className="kpi-label">Alertas</div></div></div>
      <div className="kpi" title="Valor del sobrestock estimado sobre la cobertura objetivo; no es una pérdida confirmada.">
        <span className="kpi-icon purple"><TrendingUp size={24} /></span>
        <div><div className="kpi-value" data-testid="kpi-exposure">{formatUsd(k.exposure)}</div><div className="kpi-label">Exposición estimada</div></div></div>
      <div className="kpi" title={k.coverageSku ? `Stock ÷ demanda diaria · ${k.coverageSku}` : 'Sin datos suficientes'}>
        <span className="kpi-icon purple"><Gauge size={24} /></span>
        <div><div className="kpi-value" data-testid="kpi-coverage">{k.coverageDays === null ? '—' : `${formatNumber(k.coverageDays)} días`}</div>
          <div className="kpi-label">Cobertura{k.coverageSku ? ` · ${k.coverageSku}` : ''}</div></div></div>
    </section>
  );
}

export function PendingView({ title }: { title: string }) {
  return (
    <div className="card pending-view">
      <span className="kpi-icon purple"><FileText size={30} /></span>
      <h2>{title}</h2>
      <p>Esta sección aún no está disponible en la demo.</p>
      <p className="small">Próximamente: reportes PDF/XLSX de exactitud, recepciones y acciones aprobadas.</p>
    </div>
  );
}

export { formatNumber };
