// Selectores derivados del estado único. La UI (3D, 2D, paneles) solo lee a través de aquí o del estado.
import type { AlertPriority, LogisticUnit, VerificationStatus } from '../domain/types';
import type { DemoState } from './demoState';

export const DEMO_UNIT_ID = 'PAL-001';
export const DEMO_EVENT_ID = 'evt-demo-001';
export const DEMO_RECOMMENDATION_ID = 'rec-sku-a';

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  EXPECTED: 'Esperado (sin lectura)',
  OBSERVED: 'Observado',
  PENDING_VERIFICATION: 'Pendiente de verificación',
  CONFIRMED: 'Confirmado',
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

export function describeLocation(state: DemoState, locationId: string | null): string {
  if (!locationId) return '—';
  const loc = state.locations.find((l) => l.id === locationId);
  if (!loc) return locationId;
  const rack = state.racks.find((r) => r.id === loc.rackId);
  const zone = state.zones.find((z) => z.id === rack?.zoneId);
  return `${loc.id} · ${zone?.name ?? ''} · ${rack?.name ?? ''} · nivel ${loc.level}`;
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

export type DemoStepId = 'select' | 'event' | 'alert' | 'analytics' | 'approve' | 'done';

export interface DemoStep { id: DemoStepId; label: string; done: boolean }

/** Recorrido guiado de 90 s derivado exclusivamente del estado (sin temporizadores). */
export function demoSteps(state: DemoState): DemoStep[] {
  const selected = state.ui.selectedUnitId === DEMO_UNIT_ID || state.events.some((e) => e.id === DEMO_EVENT_ID);
  const eventDone = state.events.some((e) => e.id === DEMO_EVENT_ID);
  const rec = state.recommendations.find((r) => r.id === DEMO_RECOMMENDATION_ID);
  const approved = rec?.status === 'APPROVED';
  const alertSeen = eventDone && (state.ui.view === 'alerts' || state.ui.view === 'analytics' || approved);
  const analyticsSeen = state.ui.view === 'analytics' || approved;
  return [
    { id: 'select', label: 'Seleccionar PAL-001', done: selected },
    { id: 'event', label: 'Ejecutar evento simulado', done: eventDone },
    { id: 'alert', label: 'Revisar alerta', done: alertSeen },
    { id: 'analytics', label: 'Ver predicción', done: analyticsSeen },
    { id: 'approve', label: 'Aprobar recomendación', done: approved },
  ];
}

export function nextDemoStep(state: DemoState): DemoStepId {
  return demoSteps(state).find((s) => !s.done)?.id ?? 'done';
}
