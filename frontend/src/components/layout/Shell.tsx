// Estructura: barra lateral (Operaciones), encabezado con migas y bodega, encabezado de página y tarjeta KPI.
import {
  Activity, Archive, Backpack, Box, Boxes, Cable, Calculator, ChartLine, ChevronDown, ClipboardCheck, FileText, Keyboard,
  LayoutDashboard, Mouse, NotebookPen, Palette, Paperclip, PenLine, Printer, RotateCcw, type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { DemoState, Section } from '../../store/demoState';
import type { Actions } from '../actions';

export const NAV: { section: Section; label: string; icon: LucideIcon }[] = [
  { section: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { section: 'gemelo', label: 'Gemelo digital', icon: Box },
  { section: 'inventario', label: 'Inventario', icon: Archive },
  { section: 'eventos', label: 'Eventos', icon: Activity },
  { section: 'analitica', label: 'Analítica', icon: ChartLine },
  { section: 'acciones', label: 'Acciones', icon: ClipboardCheck },
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

/** "Bodega Quito Norte (simulada)" → "Quito · Bodega Norte". */
export function warehouseLabel(state: DemoState): string {
  const n = state.warehouse.name.replace(' (simulada)', '');
  const m = /^Bodega (\S+) (.+)$/.exec(n);
  return m ? `${m[1]} · Bodega ${m[2]}` : n;
}

function BrandMark({ size = 22 }: { size?: number }) {
  return <span className="brand-mark" aria-hidden><Box size={size} strokeWidth={2.2} /></span>;
}

export function Sidebar({ state, actions }: { state: DemoState; actions: Actions }) {
  const pending = state.recommendations.filter((r) => r.status === 'PROPOSED' && r.type !== 'VERIFY_LOCATION').length;
  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="brand">
        <BrandMark />
        <div><div className="brand-name">HIVE</div><div className="brand-sub">Inteligencia de bodega</div></div>
      </div>
      <div className="nav-label">Operaciones</div>
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
            <Icon size={18} aria-hidden /> <span>{label}</span>
            {section === 'acciones' && pending > 0 && <span className="nav-badge">{pending}</span>}
          </button>
        ))}
      </nav>
      <div className="sim-card" data-testid="sim-banner">
        <BrandMark size={16} />
        <div><strong>Modo simulación</strong><span>Datos de demostración</span></div>
        <button type="button" className="sim-reset" onClick={actions.reset} title="Reiniciar demo" aria-label="Reiniciar demo"><RotateCcw size={15} /></button>
      </div>
    </aside>
  );
}

export function Header({ state }: { state: DemoState }) {
  const current = NAV.find((n) => n.section === state.ui.section)?.label ?? '';
  return (
    <header className="header">
      <div className="crumbs"><span>Operaciones</span><strong>{current}</strong></div>
      <button type="button" className="wh-select" disabled title="Una bodega en esta demo">
        {warehouseLabel(state)} <ChevronDown size={16} aria-hidden />
      </button>
      <div className="header-right">
        <span className="avatar" aria-label="Perfil de usuario">VA</span>
      </div>
    </header>
  );
}

export function PageHead({ state, title, sub, children }: { state: DemoState; title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow">{warehouseLabel(state)}</div>
        <h1 className="page-title">{title}</h1>
        <p className="page-sub">{sub}</p>
      </div>
      {children}
    </div>
  );
}

export function Kpi({ label, value, caption, icon: Icon, tone = 'purple', testId, onCaption }: {
  label: string; value: string; caption: string; icon: LucideIcon; tone?: 'purple' | 'blue' | 'amber' | 'green'; testId?: string; onCaption?: () => void;
}) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${tone}`}><Icon size={17} /></span></div>
      <div className="kpi-value" data-testid={testId}>{value}</div>
      {onCaption
        ? <button type="button" className="kpi-caption" onClick={onCaption}>{caption}</button>
        : <div className="kpi-caption">{caption}</div>}
    </div>
  );
}

export function Chip({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'sim'; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}
