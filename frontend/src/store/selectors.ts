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
  return `${loc.id} (${zone?.name ?? ''}, ${rack.name}, bahía ${loc.slot}, nivel ${loc.level})`;
}

const CHANNEL_LABEL = { RFID_PORTAL: 'Portal RFID del andén', RFID_HANDHELD: 'Lector de mano RFID', BLE_BEACON: 'Beacon BLE' } as const;

export function eventSourceLabel(e: InventoryEvent): string {
  const base = e.channel ? CHANNEL_LABEL[e.channel] : 'Lectura RFID';
  return `${base}${e.antenna ? ` · antena ${e.antenna}` : ''}${e.source === 'SIMULATED' ? ' (simulada)' : ''}`;
}

/** Unidades y valor de una unidad logística (para un pallet: contenido declarado). */
export function unitValue(state: DemoState, unit: LogisticUnit): { units: number; usd: number } {
  const sku = skuOfUnit(state, unit);
  return { units: unit.quantityBaseUnits, usd: unit.quantityBaseUnits * (sku?.unitCost ?? 0) };
}

export interface AlertStory { title: string; detail: string; units: number; usd: number; next: string }

/** Explicación de negocio de una alerta: qué pasó, cuánto involucra y qué hacer. */
export function alertStory(state: DemoState, alert: Alert): AlertStory {
  const unit = state.units.find((u) => u.id === alert.unitId);
  const value = unit ? unitValue(state, unit) : { units: 0, usd: 0 };
  const sku = unit ? skuOfUnit(state, unit) : null;
  const what = unit ? `${unit.id}${sku ? ` · ${sku.name}` : ''}` : 'Unidad';
  if (alert.type === 'LOCATION_MISMATCH' && unit) {
    return {
      title: `${unit.id} se leyó fuera de su ubicación`,
      detail: `${what}. Registrado en ${placeName(state, unit.expectedLocationId)}; el lector RFID lo detectó en ${placeName(state, unit.observedLocationId)}.`,
      ...value,
      next: 'Verificar físicamente ambas ubicaciones. HIVE no mueve el stock ni da por perdido el pallet hasta que una persona lo confirme.',
    };
  }
  if (alert.type === 'RECEIPT_SHORTAGE') {
    const po = state.purchaseOrders.find((p) => p.palletId === alert.unitId);
    if (po) {
      const missing = po.boxes.filter((b) => !po.receivedBoxIds.includes(b.boxId));
      const qty = missing.reduce((s, b) => s + b.qty, 0);
      const skuName = state.skus.find((s) => s.id === po.skuId)?.name ?? po.skuId;
      const cost = state.skus.find((s) => s.id === po.skuId)?.unitCost ?? 0;
      return {
        title: `Faltan ${missing.length} de ${po.boxes.length} cajas en la recepción ${po.id}`,
        detail: `${skuName} · ${po.supplier}. El portal RFID leyó ${po.receivedBoxIds.length} cajas; no respondió ${missing.map((m) => m.boxId).join(', ')}.`,
        units: qty,
        usd: Math.round(qty * cost * 100) / 100,
        next: 'Contar el pallet antes de firmar la guía. Si se confirma, reclamar al proveedor: el inventario ya registra solo lo recibido.',
      };
    }
  }
  if (alert.type === 'NOT_OBSERVED' && unit) {
    return {
      title: `${unit.id} no respondió en el último recorrido`,
      detail: `${what}. Registrado en ${placeName(state, unit.expectedLocationId)}; ningún lector leyó su etiqueta.`,
      ...value,
      next: 'Recontar la ubicación. Una lectura faltante no significa pérdida: la etiqueta puede estar tapada o dañada.',
    };
  }
  return { title: alert.description, detail: '', ...value, next: 'Revisar la evidencia.' };
}

export function describeLocation(state: DemoState, locationId: string | null): string {
  if (!locationId) return '—';
  const loc = state.locations.find((l) => l.id === locationId);
  if (!loc) return locationId;
  const rack = state.racks.find((r) => r.id === loc.rackId);
  const zone = state.zones.find((z) => z.id === rack?.zoneId);
  if (!rack?.aisle) return `${loc.id} · ${zone?.name ?? ''} · posición ${loc.slot}`;
  return `${loc.id} · ${zone?.name ?? ''} · ${rack.name} · bahía ${loc.slot} · nivel ${loc.level}`;
}

export function pallets(state: DemoState): LogisticUnit[] {
  return state.units.filter((u) => u.type === 'PALLET');
}

export function skuOfUnit(state: DemoState, unit: LogisticUnit) {
  const lot = state.lots.find((l) => l.id === unit.lotId);
  return lot ? state.skus.find((s) => s.id === lot.skuId) ?? null : null;
}

/** Pallet que debe resaltarse por discrepancia/alerta abierta. */
export function unitsWithOpenAlerts(state: DemoState): Set<string> {
  return new Set(state.alerts.filter((a) => a.status !== 'RESOLVED' && a.unitId).map((a) => a.unitId!));
}

export const RECEIPT_SCENARIO_ID = 'DEMO_RECEIPT_001';
export const COUNT_SCENARIO_ID = 'DEMO_COUNT_P4';
export const CLAIM_RECOMMENDATION_ID = 'rec-claim-oc-2026-1187';

export type DemoStepId = 'receive' | 'count' | 'alert' | 'analytics' | 'approve' | 'measure' | 'done';
export type DemoPhase = 'Detectar' | 'Priorizar' | 'Actuar' | 'Medir';

export interface DemoStep { id: DemoStepId; label: string; phase: DemoPhase; done: boolean }

/** Recorrido guiado de 90 s derivado exclusivamente del estado (sin temporizadores propios). */
export function demoSteps(state: DemoState): DemoStep[] {
  const received = state.purchaseOrders.every((p) => p.status === 'CLOSED');
  const counted = state.events.some((e) => e.id === DEMO_EVENT_ID) && state.ui.playback !== COUNT_SCENARIO_ID;
  const recs = [DEMO_RECOMMENDATION_ID, CLAIM_RECOMMENDATION_ID]
    .map((id) => state.recommendations.find((r) => r.id === id)).filter((r) => r !== undefined);
  const approved = state.recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID)?.status === 'APPROVED'
    && recs.every((r) => r.status !== 'PROPOSED');
  const later = (v: string) => ['alerts', 'analytics', 'measure'].includes(v);
  const alertSeen = counted && (later(state.ui.view) || approved);
  const analyticsSeen = alertSeen && (state.ui.view === 'analytics' || state.ui.view === 'measure' || approved);
  const measured = approved && state.ui.view === 'measure';
  return [
    { id: 'receive', label: 'Recibir camión', phase: 'Detectar', done: received },
    { id: 'count', label: 'Contar pasillo 4', phase: 'Detectar', done: counted },
    { id: 'alert', label: 'Revisar alertas', phase: 'Priorizar', done: alertSeen },
    { id: 'analytics', label: 'Ver predicción', phase: 'Priorizar', done: analyticsSeen },
    { id: 'approve', label: 'Aprobar acciones', phase: 'Actuar', done: approved },
    { id: 'measure', label: 'Ver resultados', phase: 'Medir', done: measured },
  ];
}

export function nextDemoStep(state: DemoState): DemoStepId {
  return demoSteps(state).find((s) => !s.done)?.id ?? 'done';
}
