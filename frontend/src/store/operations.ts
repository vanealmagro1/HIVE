// Selectores de las pantallas de operación (Dashboard, Inventario, Eventos). Todo sale del estado único.
import { addDays } from '../domain/dates';
import { formatNumber } from '../domain/format';
import type { LogisticUnit } from '../domain/types';
import { receiptShortage } from '../engine/receiving';
import { siteName } from '../engine/transfers';
import type { DemoState } from './demoState';
import { alertStory, unitContents } from './selectors';
import { BEACON_BOXES } from '../seed/seed';

const beaconLabel = (unitId: string) => BEACON_BOXES.find((b) => b.unitId === unitId)?.label ?? null;

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'sim';
export interface Badge { label: string; tone: Tone }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "19-nov" a partir de 'YYYY-MM-DD…' (sin depender de la zona horaria del equipo). */
export function fmtDay(iso: string): string {
  return `${Number(iso.slice(8, 10))}-${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** "19-nov, 10:25 a. m." (la hora se muestra tal como está registrada en la demo). */
export function fmtDateTime(iso: string): string {
  if (iso.length <= 10) return fmtDay(iso);
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${fmtDay(iso)}, ${String(h12).padStart(2, '0')}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** Estado de verificación de un pallet en lenguaje de bodega. */
export function verification(unit: LogisticUnit): Badge {
  if (unit.observedLocationId && unit.observedLocationId !== unit.expectedLocationId) return { label: 'Discrepancia', tone: 'bad' };
  switch (unit.verificationStatus) {
    case 'OBSERVED': return { label: 'Pallet observado', tone: 'ok' };
    case 'CONFIRMED': return { label: 'Verificado', tone: 'ok' };
    case 'PENDING_VERIFICATION': return { label: 'Por verificar', tone: 'warn' };
    default: return { label: 'Sin lectura', tone: 'sim' };
  }
}
export const VERIFICATION_FILTERS = ['Pallet observado', 'Por verificar', 'Discrepancia', 'Sin lectura', 'Verificado'];

/** Ubicaciones de almacenamiento ocupadas por al menos una unidad raíz. */
export function occupancy(state: DemoState): { used: number; total: number; pct: number } {
  const storage = state.locations.filter((l) => !l.id.startsWith('REC-'));
  const ids = new Set(storage.map((l) => l.id));
  const used = new Set(state.units.filter((u) => !u.parentId && ids.has(u.expectedLocationId)).map((u) => u.expectedLocationId)).size;
  return { used, total: storage.length, pct: storage.length ? (used / storage.length) * 100 : 0 };
}

export type EventKind = 'Detección' | 'Recepción' | 'Despacho' | 'Traslado';
export const EVENT_KINDS: EventKind[] = ['Detección', 'Recepción', 'Despacho', 'Traslado'];

export interface HistoryRow {
  id: string;
  at: string;
  kind: EventKind;
  ref: string;
  unitLabel: string;
  product: string;
  status: Badge;
  /** Unidad cuya evidencia se puede abrir (null = registro agregado). */
  unitId: string | null;
  /** Eventos de origen (para el detalle de evidencia). */
  eventIds: string[];
  note: string;
  /** Procedencia visible: "Simulado" o el lector real (beacon BLE). */
  origin: string;
  /** true si es una lectura en vivo de beacon. */
  live?: boolean;
}

/**
 * Historial de eventos: lecturas en vivo (recepción por portal, conteo con lector de mano), traslados y los
 * despachos registrados de la última semana. Ordenado del más reciente al más antiguo.
 */
export function eventHistory(state: DemoState, days = 7): HistoryRow[] {
  const rows: (Omit<HistoryRow, 'origin'> & { origin?: string })[] = [];
  const name = (skuId: string) => state.skus.find((k) => k.id === skuId)?.name || skuId;

  // Recepciones (una fila por orden de compra con lecturas).
  for (const po of state.purchaseOrders) {
    if (po.receivedBoxIds.length === 0) continue;
    const reads = state.events.filter((e) => e.purchaseOrderId === po.id);
    const sh = receiptShortage(state, po);
    const status: Badge = po.status !== 'CLOSED' ? { label: 'En lectura', tone: 'info' }
      : sh.missing.length ? { label: sh.missing.length === 1 ? 'Falta 1 caja' : `Faltan ${sh.missing.length} cajas`, tone: 'warn' } : { label: 'Confirmado', tone: 'ok' };
    rows.push({
      id: `rx-${po.id}`, at: po.closedAt ?? reads.at(-1)?.capturedAt ?? po.expectedAt, kind: 'Recepción', ref: po.id,
      unitLabel: po.palletId, product: name(po.skuId), status, unitId: po.palletId, eventIds: reads.map((e) => e.id),
      note: `${po.receivedBoxIds.length} de ${po.boxes.length} cajas leídas por el portal RFID del andén.`,
    });
  }

  // Detecciones: lecturas que contradicen la ubicación registrada o etiquetas sin respuesta; el resto, agregado por recorrido.
  const flagged = new Set(state.alerts.flatMap((a) => a.evidenceEventIds));
  const sweeps = new Map<string, typeof state.events>();
  for (const e of state.events) {
    if (e.type === 'RECEIPT_READ') continue;
    if (e.source === 'BLE') {
      const unit = state.units.find((u) => u.id === e.unitId);
      const ok = !!unit && e.locationHintId === unit.expectedLocationId;
      rows.push({
        id: e.id, at: e.capturedAt, kind: 'Detección', ref: `Beacon ${beaconLabel(e.unitId) ?? ''}`.trim(),
        unitLabel: e.unitId, product: unit ? unitContents(state, unit).title : e.unitId,
        status: ok ? { label: 'Verificada', tone: 'ok' } : { label: 'Fuera de lugar', tone: 'bad' },
        unitId: e.unitId, eventIds: [e.id], live: true,
        origin: e.readerId === 'laptop' ? 'Beacon · laptop' : 'Beacon · celular',
        note: ok ? `Leída en su ubicación ${e.locationHintId}.` : `Leída en ${e.locationHintId}; su ubicación es ${unit?.expectedLocationId ?? '—'}.`,
      });
      continue;
    }
    if (flagged.has(e.id)) {
      const unit = state.units.find((u) => u.id === e.unitId);
      const root = unit?.parentId ? state.units.find((u) => u.id === unit.parentId) : unit;
      rows.push({
        id: e.id, at: e.capturedAt, kind: 'Detección', ref: e.id.toUpperCase(),
        unitLabel: root?.id ?? e.unitId, product: root ? unitContents(state, root).title : e.unitId,
        status: e.type === 'MISSED_READ' ? { label: 'Sin lectura', tone: 'warn' } : { label: 'Observación', tone: 'info' },
        unitId: root?.id ?? e.unitId, eventIds: [e.id],
        note: e.type === 'MISSED_READ' ? 'La etiqueta no respondió en el recorrido.' : `Leído en ${e.locationHintId}; registrado en ${root?.expectedLocationId ?? '—'}.`,
      });
    } else {
      sweeps.set(e.scenarioId, [...(sweeps.get(e.scenarioId) ?? []), e]);
    }
  }
  for (const [scenarioId, list] of sweeps) {
    const locs = new Set(list.map((e) => e.locationHintId).filter(Boolean));
    rows.push({
      id: `sweep-${scenarioId}`, at: list.at(-1)!.capturedAt, kind: 'Detección', ref: scenarioId,
      unitLabel: `${formatNumber(list.length)} lecturas`, product: `Conteo cíclico · ${locs.size} ubicaciones`,
      status: { label: 'Confirmado', tone: 'ok' }, unitId: null, eventIds: list.map((e) => e.id),
      note: 'Lecturas coherentes con la ubicación registrada.',
    });
  }

  // Traslados ejecutados en la demo.
  for (const m of state.movements) {
    rows.push({
      id: m.id, at: m.completedAt ?? m.startedAt ?? m.plannedAt, kind: 'Traslado', ref: m.id.toUpperCase(),
      unitLabel: m.unitIds.join(' · '), product: name(m.skuId),
      status: m.status === 'COMPLETED' ? { label: 'Confirmado', tone: 'ok' } : m.status === 'IN_PROGRESS' ? { label: 'En curso', tone: 'info' } : { label: 'Planificado', tone: 'sim' },
      unitId: m.unitIds[0] ?? null, eventIds: [],
      note: `${formatNumber(m.quantity)} u hacia ${siteName(state, m.toWarehouseId).replace(' (simulada)', '')}.`,
    });
  }

  // Registros previos (semilla): traslados internos y despachos diarios a clientes.
  const from = addDays(state.referenceDate, -days);
  for (const t of state.internalTransfers) {
    if (t.date < from) continue;
    rows.push({
      id: `tr-${t.skuId}-${t.date}`, at: `${t.date}T15:00:00Z`, kind: 'Traslado', ref: `TR-${t.date.slice(5).replace('-', '')}`,
      unitLabel: `${formatNumber(t.baseUnits)} u`, product: name(t.skuId), status: { label: 'Confirmado', tone: 'ok' },
      unitId: null, eventIds: [], note: t.note,
    });
  }
  const dispatch = new Map<string, { units: number; skus: Set<string> }>();
  for (const d of state.dailyDemand) {
    if (d.date < from || d.dispatchedBaseUnits <= 0) continue;
    const cur = dispatch.get(d.date) ?? { units: 0, skus: new Set<string>() };
    cur.units += d.dispatchedBaseUnits; cur.skus.add(d.skuId);
    dispatch.set(d.date, cur);
  }
  for (const [date, v] of dispatch) {
    rows.push({
      id: `dx-${date}`, at: `${date}T17:00:00Z`, kind: 'Despacho', ref: `DS-${date.slice(5).replace('-', '')}`,
      unitLabel: `${formatNumber(v.units)} u`, product: `Despachos a clientes · ${v.skus.size} productos`,
      status: { label: 'Confirmado', tone: 'ok' }, unitId: null, eventIds: [], note: 'Salidas registradas en el día (demanda).',
    });
  }
  return rows.map((r) => ({ ...r, origin: r.origin ?? 'Simulado' })).sort((a, b) => b.at.localeCompare(a.at));
}

export interface DayMovement { date: string; entradas: number; salidas: number; traslados: number }

/** Unidades por día (entradas confirmadas, salidas a clientes y traslados) de los últimos `days` días, hoy incluido. */
export function movementsByDay(state: DemoState, days: number): DayMovement[] {
  const dates = Array.from({ length: days }, (_, i) => addDays(state.referenceDate, i - days + 1));
  const map = new Map(dates.map((d) => [d, { date: d, entradas: 0, salidas: 0, traslados: 0 }]));
  for (const d of state.dailyDemand) { const x = map.get(d.date); if (x) x.salidas += d.dispatchedBaseUnits; }
  for (const t of state.internalTransfers) { const x = map.get(t.date); if (x) x.traslados += t.baseUnits; }
  for (const po of state.purchaseOrders) {
    if (po.status !== 'CLOSED' || !po.closedAt) continue;
    const x = map.get(po.closedAt.slice(0, 10));
    if (x) x.entradas += po.boxes.filter((b) => po.receivedBoxIds.includes(b.boxId)).reduce((t, b) => t + b.qty, 0);
  }
  for (const m of state.movements) {
    if (m.status !== 'COMPLETED' || !m.completedAt) continue;
    const x = map.get(m.completedAt.slice(0, 10));
    if (x) x.traslados += m.quantity;
  }
  return dates.map((d) => map.get(d)!);
}

export interface AttentionItem { id: string; kind: 'location' | 'verify' | 'stock' | 'receipt' | 'expiry'; title: string; desc: string; unitId: string | null; skuId: string | null }

/** Lo que requiere atención: alertas abiertas y recomendaciones propuestas. */
export function attentionItems(state: DemoState): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const a of state.alerts) {
    if (a.status === 'RESOLVED') continue;
    const s = alertStory(state, a);
    const kind = a.type === 'LOCATION_MISMATCH' ? 'location' : a.type === 'RECEIPT_SHORTAGE' ? 'receipt' : 'verify';
    const desc = a.type === 'LOCATION_MISMATCH' && a.unitId
      ? `${a.unitId} se observó en ${s.detected}. Su ubicación asignada es ${s.expected}.`
      : a.type === 'NOT_OBSERVED' && a.unitId ? `${a.unitId} figura en ${s.expected} y está pendiente de observación.` : s.title;
    const title = a.type === 'LOCATION_MISMATCH' ? 'Discrepancia de ubicación' : a.type === 'NOT_OBSERVED' ? 'Pallet pendiente de verificación' : s.heading;
    items.push({ id: a.id, kind, title, desc, unitId: a.unitId, skuId: null });
  }
  for (const r of state.recommendations) {
    if (r.status !== 'PROPOSED' || !r.skuId) continue;
    const sku = state.skus.find((k) => k.id === r.skuId)?.name || r.skuId;
    if (r.type === 'REVIEW_EXCESS') items.push({ id: r.id, kind: 'stock', title: 'Sobrestock proyectado', desc: `${sku} · ${formatNumber(r.quantity ?? 0)} unidades excedentes`, unitId: null, skuId: r.skuId });
    else if (r.type === 'PRIORITIZE_FEFO') items.push({ id: r.id, kind: 'expiry', title: 'Riesgo de vencimiento', desc: `${sku} · ${r.title}`, unitId: null, skuId: r.skuId });
  }
  return items;
}

export interface BeaconCount { verified: number; total: number; misplaced: number; lastAt: string | null; lastLabel: string | null }

/** Conteo automático de las cajas con beacon: cuántas verificó HIVE en su ubicación y cuál fue la última lectura. */
export function beaconCount(state: DemoState): BeaconCount {
  const ble = state.events.filter((e) => e.source === 'BLE');
  let verified = 0;
  let misplaced = 0;
  for (const b of BEACON_BOXES) {
    const u = state.units.find((x) => x.id === b.unitId);
    if (!u || !ble.some((e) => e.unitId === u.id)) continue;
    if (u.verificationStatus === 'OBSERVED') verified += 1;
    else if (u.verificationStatus === 'PENDING_VERIFICATION') misplaced += 1;
  }
  const last = ble.at(-1) ?? null;
  return { verified, total: BEACON_BOXES.length, misplaced, lastAt: last?.capturedAt ?? null, lastLabel: last ? beaconLabel(last.unitId) : null };
}

export interface LiveRow { unitId: string; label: string; product: string; qty: number; readAt: string; readLocation: string; expectedLocation: string; ok: boolean; eventId: string }
export interface LiveInventory { rows: LiveRow[]; pending: { unitId: string; label: string; product: string }[]; countedBoxes: number; totalBoxes: number; countedUnits: number; totalUnits: number }

/**
 * Inventario contado en vivo con los beacons: una fila por caja leída (su última lectura, la más reciente arriba),
 * cajas pendientes y totales de cajas y unidades contadas frente a las esperadas.
 */
export function liveInventory(state: DemoState): LiveInventory {
  const ble = state.events.filter((e) => e.source === 'BLE');
  const rows: LiveRow[] = [];
  const pending: LiveInventory['pending'] = [];
  let totalUnits = 0;
  for (const b of BEACON_BOXES) {
    const u = state.units.find((x) => x.id === b.unitId);
    if (!u) continue;
    const c = unitContents(state, u);
    totalUnits += c.qty;
    const last = [...ble].reverse().find((e) => e.unitId === u.id);
    if (!last) { pending.push({ unitId: u.id, label: b.label, product: c.title }); continue; }
    rows.push({
      unitId: u.id, label: b.label, product: c.title, qty: c.qty, readAt: last.capturedAt,
      readLocation: last.locationHintId ?? '—', expectedLocation: u.expectedLocationId,
      ok: last.locationHintId === u.expectedLocationId && u.verificationStatus === 'OBSERVED', eventId: last.id,
    });
  }
  const order = new Map(ble.map((e, i) => [e.id, i]));
  rows.sort((a, b) => (order.get(b.eventId) ?? 0) - (order.get(a.eventId) ?? 0));
  return { rows, pending, countedBoxes: rows.length, totalBoxes: BEACON_BOXES.length, countedUnits: rows.reduce((t, r) => t + r.qty, 0), totalUnits };
}
