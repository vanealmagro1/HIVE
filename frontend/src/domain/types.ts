// Modelo canónico de HIVE para la demo (plan de la demo, §5 "Modelo canónico").
// Todos los IDs son estables. Los datos son SINTÉTICOS.

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // 'YYYY-MM-DDTHH:mm:ssZ'

export interface Company { id: string; name: string }
export interface Warehouse { id: string; companyId: string; name: string }
export interface Zone { id: string; warehouseId: string; name: string }
export interface Rack { id: string; zoneId: string; name: string }
export interface Location { id: string; rackId: string; level: number; slot: number }

export interface SKU {
  id: string;
  name: string;
  unitCost: number; // USD por unidad base
  hasExpiry: boolean;
}

export interface Lot { id: string; skuId: string; expiryDate: ISODate | null }

export type LogisticUnitType = 'PALLET' | 'BOX';

/**
 * EXPECTED: solo existe el registro esperado (sistema).
 * OBSERVED: hay evidencia coherente con la ubicación esperada.
 * PENDING_VERIFICATION: evidencia contradictoria o ausencia de lectura; requiere verificación humana.
 * CONFIRMED: verificado por una persona (no lo produce ningún evento automático).
 */
export type VerificationStatus = 'EXPECTED' | 'OBSERVED' | 'PENDING_VERIFICATION' | 'CONFIRMED';

export interface LogisticUnit {
  id: string;
  type: LogisticUnitType;
  parentId: string | null;
  lotId: string | null;
  /**
   * Regla de agregación: para cajas es su contenido en unidades base.
   * Para pallets es el contenido DECLARADO (= suma de sus cajas hijas); NUNCA se suma al stock
   * junto con sus cajas. El stock de un SKU = suma de las unidades hoja (sin hijos).
   */
  quantityBaseUnits: number;
  expectedLocationId: string;
  /** Ubicación asociada a la última evidencia. NO es ubicación física confirmada. */
  observedLocationId: string | null;
  verificationStatus: VerificationStatus;
  lastObservedAt: ISODateTime | null;
  lastEventId: string | null;
}

export type EventSource = 'SIMULATED' | 'BLE' | 'RFID_FUTURE';
export type InventoryEventType = 'OBSERVATION' | 'MISSED_READ';

export interface InventoryEvent {
  id: string;
  scenarioId: string;
  source: EventSource;
  capturedAt: ISODateTime;
  receivedAt: ISODateTime;
  unitId: string;
  type: InventoryEventType;
  locationHintId: string | null;
  evidenceNote: string;
}

export type DiscrepancyKind = 'LOCATION_MISMATCH' | 'NOT_OBSERVED';

export interface Discrepancy {
  id: string;
  kind: DiscrepancyKind;
  unitId: string;
  expectedLocationId: string;
  observedLocationId: string | null;
  status: 'PENDING_VERIFICATION' | 'RESOLVED';
  description: string;
  evidenceEventIds: string[];
}

export type AlertPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertStatus = 'NEW' | 'IN_REVIEW' | 'RESOLVED';

export interface Alert {
  id: string;
  type: DiscrepancyKind;
  priority: AlertPriority;
  status: AlertStatus;
  unitId: string | null;
  description: string;
  evidenceEventIds: string[];
  createdAt: ISODateTime;
}

export type RecommendationType = 'REVIEW_EXCESS' | 'PRIORITIZE_FEFO' | 'VERIFY_LOCATION';
export type RecommendationStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  reason: string;
  skuId: string | null;
  unitId: string | null;
  estimatedImpactUsd: number | null;
  status: RecommendationStatus;
  assumptions: string[];
}

export interface Task {
  id: string;
  recommendationId: string;
  title: string;
  status: 'OPEN' | 'DONE';
  owner: string | null;
}

/** Solo despachos a clientes. Las transferencias internas NO son demanda. */
export interface DailyDemand { skuId: string; date: ISODate; dispatchedBaseUnits: number }

/** Transferencias internas entre ubicaciones/bodegas: se registran pero se excluyen de la demanda. */
export interface InternalTransfer { skuId: string; date: ISODate; baseUnits: number; note: string }

export interface SkuPolicy { skuId: string; targetCoverageDays: number }

export interface SeedData {
  company: Company;
  warehouse: Warehouse;
  zones: Zone[];
  racks: Rack[];
  locations: Location[];
  skus: SKU[];
  lots: Lot[];
  units: LogisticUnit[];
  dailyDemand: DailyDemand[];
  internalTransfers: InternalTransfer[];
  policies: SkuPolicy[];
}
