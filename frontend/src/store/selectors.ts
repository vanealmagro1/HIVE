// Selectores derivados del estado único. La UI (3D, 2D, paneles) solo lee a través de aquí o del estado.
import { formatNumber } from '../domain/format';
import type { Alert, AlertPriority, InventoryEvent, LogisticUnit, VerificationStatus } from '../domain/types';
import type { DemoState } from './demoState';

export const DEMO_UNIT_ID = 'PAL-001';
export const DEMO_EVENT_ID = 'evt-demo-001';
export const DEMO_RECOMMENDATION_ID = 'rec-moc-001';

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  EXPECTED: 'Sin lectura reciente',
  OBSERVED: 'Leído por RFID',
  PENDING_VERIFICATION: 'Por verificar',
  CONFIRMED: 'Verificado por operario',
};

export const STATUS_ICON: Record<VerificationStatus, string> = {
  EXPECTED: '○',
  OBSERVED: '●',
  PENDING_VERIFICATION: '⚠',
  CONFIRMED: '✔',
};

export const PRIORITY_LABEL: Record<AlertPriority, string> = {
  LOW: 'BAJA', MEDIUM: 'MEDIA', HIGH: 'ALTA', CRITICAL: 'CRÍTICA',
};

export const fmtUnits = (n: number) => `${formatNumber(n)} u`;

/** Ubicación en lenguaje de bodega: "LOC-A1 (Zona A, Rack A1, nivel 1)". */
export function placeName(state: DemoState, locationId: string | null): string {
  if (!locationId) return '—';
  const loc = state.locations.find((l) => l.id === locationId);
  if (!loc) return locationId;
  const rack = state.racks.find((r) => r.id === loc.rackId);
  const zone = state.zones.find((z) => z.id === rack?.zoneId);
  if (!rack?.aisle) return `${loc.id} (${zone?.name ?? ''})`;
  return `${loc.id} (${zone?.name ?? ''}, ${rack.name}, nivel ${loc.level})`;
}

const CHANNEL_LABEL = { RFID_PORTAL: 'Portal RFID del andén', RFID_HANDHELD: 'Lector de mano RFID', BLE_BEACON: 'Beacon BLE' } as const;

export function eventSourceLabel(e: InventoryEvent): string {
  const base = e.channel ? CHANNEL_LABEL[e.channel] : 'Lectura RFID';
  return `${base}${e.antenna ? ` · antena ${e.antenna}` : ''}`;
}

/** Unidades y valor de una unidad logística (para un pallet: contenido declarado). */
export function unitValue(state: DemoState, unit: LogisticUnit): { units: number; usd: number } {
  const sku = skuOfUnit(state, unit);
  return { units: unit.quantityBaseUnits, usd: unit.quantityBaseUnits * (sku?.unitCost ?? 0) };
}

export interface AlertStory {
  title: string; detail: string; units: number; usd: number; next: string;
  /** Campos estructurados para la UI orientada al producto. */
  heading: string; product: string; refLine: string; expected: string | null; detected: string | null; detectedIsZone: boolean;
}

/** Explicación de negocio de una alerta: qué pasó, cuánto involucra y qué hacer. */
export function alertStory(state: DemoState, alert: Alert): AlertStory {
  const unit = state.units.find((u) => u.id === alert.unitId);
  const value = unit ? unitValue(state, unit) : { units: 0, usd: 0 };
  const contents = unit ? unitContents(state, unit) : null;
  const product = contents?.title ?? 'Unidad';
  const what = unit ? `${product} · ${unit.id}` : 'Unidad';
  if (alert.type === 'LOCATION_MISMATCH' && unit) {
    return {
      heading: 'Ubicación por verificar',
      product,
      refLine: `${contents?.skuId ?? contents?.subtitle ?? ''} · ${unit.id}`,
      expected: unit.expectedLocationId,
      detected: unit.observedLocationId,
      detectedIsZone: false,
      title: `${unit.id} se leyó fuera de su ubicación`,
      detail: `${what}. Registrado en ${placeName(state, unit.expectedLocationId)}; el lector RFID lo detectó en ${placeName(state, unit.observedLocationId)}.`,
      ...value,
      next: 'Verificar ambas ubicaciones. La ubicación oficial no cambia hasta que una persona lo confirme.',
    };
  }
  if (alert.type === 'RECEIPT_SHORTAGE') {
    const po = state.purchaseOrders.find((p) => p.palletId === alert.unitId);
    if (po) {
      const missing = po.boxes.filter((b) => !po.receivedBoxIds.includes(b.boxId));
      const qty = missing.reduce((t, b) => t + b.qty, 0);
      const skuName = state.skus.find((k) => k.id === po.skuId)?.name || po.skuId;
      const cost = state.skus.find((k) => k.id === po.skuId)?.unitCost ?? 0;
      return {
        heading: 'Faltante en recepción',
        product: skuName,
        refLine: `${po.skuId} · ${po.id}`,
        expected: `${po.boxes.length} cajas`,
        detected: `${po.receivedBoxIds.length} cajas`,
        detectedIsZone: false,
        title: `Faltan ${missing.length} de ${po.boxes.length} cajas en la recepción ${po.id}`,
        detail: `${skuName} · ${po.supplier}. El portal RFID leyó ${po.receivedBoxIds.length} cajas; no respondió ${missing.map((m) => m.boxId).join(', ')}.`,
        units: qty,
        usd: Math.round(qty * cost * 100) / 100,
        next: 'Contar el pallet antes de firmar la guía y, si se confirma, reclamar al proveedor.',
      };
    }
  }
  if (alert.type === 'NOT_OBSERVED' && unit) {
    return {
      heading: 'Sin lectura',
      product,
      refLine: `${contents?.skuId ?? ''} · ${unit.id}`,
      expected: unit.expectedLocationId,
      detected: null,
      detectedIsZone: false,
      title: `${unit.id} no respondió en el último recorrido`,
      detail: `${what}. Registrado en ${placeName(state, unit.expectedLocationId)}; ningún lector leyó su etiqueta.`,
      ...value,
      next: 'Recontar la ubicación. Una lectura faltante no significa pérdida.',
    };
  }
  return { heading: 'Alerta', product, refLine: '', expected: null, detected: null, detectedIsZone: false, title: alert.description, detail: '', ...value, next: 'Revisar la evidencia.' };
}

export function describeLocation(state: DemoState, locationId: string | null): string {
  if (!locationId) return '—';
  const loc = state.locations.find((l) => l.id === locationId);
  if (!loc) return locationId;
  const rack = state.racks.find((r) => r.id === loc.rackId);
  const zone = state.zones.find((z) => z.id === rack?.zoneId);
  if (!rack?.aisle) return `${loc.id} · ${zone?.name ?? ''} · posición ${loc.slot}`;
  const bay = loc.id.split('-')[1] ?? String(loc.slot);
  return `${loc.id} · ${zone?.name ?? ''} · ${rack.name} · bahía ${bay} · nivel ${loc.level}`;
}

export function pallets(state: DemoState): LogisticUnit[] {
  return state.units.filter((u) => u.type === 'PALLET');
}

export function skuOfUnit(state: DemoState, unit: LogisticUnit) {
  const lot = state.lots.find((l) => l.id === unit.lotId);
  return lot ? state.skus.find((s) => s.id === lot.skuId) ?? null : null;
}

export interface ContentLine { skuId: string; name: string; qty: number }
export interface UnitContents {
  kind: 'single' | 'mixed';
  /** Lo primero que ve el usuario: nombre comercial del producto, o "Pallet mixto". */
  title: string;
  /** Segunda línea: "SKU · N unidades" o "N productos · X unidades". */
  subtitle: string;
  skuId: string | null;
  qty: number;
  lines: ContentLine[];
}

/**
 * Identificación orientada al producto de un pallet o caja: agrupa sus unidades hoja por SKU.
 * Un pallet con varias líneas de SKU es MIXTO y no se le atribuye un único producto.
 */
export function unitContents(state: Pick<DemoState, 'units' | 'lots' | 'skus'>, unit: LogisticUnit): UnitContents {
  const kids = state.units.filter((u) => u.parentId === unit.id);
  const leaves = kids.length > 0 ? kids : [unit];
  const bySku = new Map<string, number>();
  for (const leaf of leaves) {
    const skuId = state.lots.find((l) => l.id === leaf.lotId)?.skuId;
    if (skuId) bySku.set(skuId, (bySku.get(skuId) ?? 0) + leaf.quantityBaseUnits);
  }
  const lines = [...bySku].map(([skuId, qty]) => ({ skuId, qty, name: state.skus.find((k) => k.id === skuId)?.name || skuId }))
    .sort((a, b) => b.qty - a.qty);
  const qty = lines.reduce((t, l) => t + l.qty, 0);
  if (lines.length > 1) {
    return { kind: 'mixed', title: 'Pallet mixto', subtitle: `${lines.length} productos · ${formatNumber(qty)} unidades`, skuId: null, qty, lines };
  }
  const line = lines[0];
  return {
    kind: 'single',
    title: line?.name ?? unit.id,
    subtitle: line ? `${line.skuId} · ${formatNumber(qty)} unidades` : `${formatNumber(unit.quantityBaseUnits)} unidades`,
    skuId: line?.skuId ?? null,
    qty: line ? qty : unit.quantityBaseUnits,
    lines,
  };
}

/** Pallet que debe resaltarse por discrepancia/alerta abierta. */
export function unitsWithOpenAlerts(state: DemoState): Set<string> {
  return new Set(state.alerts.filter((a) => a.status !== 'RESOLVED' && a.unitId).map((a) => a.unitId!));
}

export const RECEIPT_SCENARIO_ID = 'DEMO_RECEIPT_001';
export const COUNT_SCENARIO_ID = 'DEMO_COUNT_P4';
export const CLAIM_RECOMMENDATION_ID = 'rec-claim-oc-2026-1187';

export type DemoStepId = 'visualize' | 'detect' | 'alert' | 'analyze' | 'recommend' | 'register';

export interface DemoStep { id: DemoStepId; title: string; subtitle: string; done: boolean }

/**
 * Recorrido guiado de 6 pasos. La navegación es explícita (ui.step); "done" se deriva del estado:
 * los pasos con acción se completan al ejecutarla; los informativos, al pasar por ellos.
 * Avanzar NUNCA aprueba ni ejecuta nada por sí solo.
 */
export function demoSteps(state: DemoState): DemoStep[] {
  const received = state.purchaseOrders.every((p) => p.status === 'CLOSED');
  const detected = state.events.some((e) => e.id === DEMO_EVENT_ID) && state.ui.playback !== COUNT_SCENARIO_ID;
  const approved = state.recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID)?.status === 'APPROVED';
  const at = state.ui.step;
  return [
    { id: 'visualize', title: 'Visualizar', subtitle: 'Tu bodega, en tiempo real', done: received },
    { id: 'detect', title: 'Detectar', subtitle: 'Movimiento detectado', done: detected },
    { id: 'alert', title: 'Alertar', subtitle: 'Ubicación por verificar', done: detected && at > 2 },
    { id: 'analyze', title: 'Analizar', subtitle: 'Impacto identificado', done: at > 3 || approved },
    { id: 'recommend', title: 'Recomendar', subtitle: 'Acción recomendada', done: approved },
    { id: 'register', title: 'Registrar', subtitle: 'Acción registrada', done: approved && at === 5 },
  ];
}

/** KPIs del encabezado, todos derivados del estado. */
export function kpis(state: DemoState, analytics: { skuId: string; skuName: string; coverageDays: number | null; excessExposureUsd: number | null }[]) {
  const units = state.units.filter((u) => !state.units.some((x) => x.parentId === u.id))
    .reduce((t, u) => t + u.quantityBaseUnits, 0);
  const alerts = state.alerts.filter((a) => a.status !== 'RESOLVED').length;
  const excessRecs = new Set(state.recommendations.filter((r) => r.type === 'REVIEW_EXCESS').map((r) => r.skuId));
  const exposed = analytics.filter((a) => excessRecs.has(a.skuId));
  const exposure = exposed.reduce((t, a) => t + (a.excessExposureUsd ?? 0), 0);
  const top = [...exposed].sort((a, b) => (b.excessExposureUsd ?? 0) - (a.excessExposureUsd ?? 0))[0];
  return { units, alerts, exposure, coverageDays: top?.coverageDays ?? null, coverageSku: top?.skuName ?? null };
}
