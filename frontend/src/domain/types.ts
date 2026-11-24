// Modelo canónico de HIVE para la demo (plan de la demo, §5 "Modelo canónico").
// Todos los IDs son estables. Los datos son SINTÉTICOS.

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // 'YYYY-MM-DDTHH:mm:ssZ'

export interface Company { id: string; name: string }
export interface Warehouse { id: string; companyId: string; name: string }
/** STORAGE = almacenamiento en racks; RECEIVING = andén de recepción con portal RFID. */
export type ZoneKind = 'STORAGE' | 'RECEIVING';
export interface Zone { id: string; warehouseId: string; name: string; kind?: ZoneKind; category?: string }
/** aisle = número de pasillo (P1…); side = lado del pasillo (I izquierdo, D derecho). */
export interface Rack { id: string; zoneId: string; name: string; aisle?: number; side?: 'I' | 'D' }
/** slot = bahía dentro del rack (1…n). */
export interface Location { id: string; rackId: string; level: number; slot: number }

export interface SKU {
  id: string;
  /** Nombre comercial (puede venir del ERP/WMS). Si falta, la UI muestra el SKU. */
  name: string;
  /** Identificador en el sistema de origen (ERP/WMS), para conciliar importaciones. */
  externalId?: string;
  category?: string;
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

/**
 * Unidad logística: pallet o caja. Las LÍNEAS de un pallet (equivalente a PalletItem) son sus cajas hijas,
 * cada una con su lote → SKU y su cantidad. Un pallet con lotId null y cajas de varios SKU es un pallet MIXTO.
 */
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
/**
 * OBSERVATION: una etiqueta se leyó asociada a una ubicación. MISSED_READ: no respondió en un recorrido.
 * RECEIPT_READ: el portal del andén leyó una etiqueta de una orden de compra en recepción.
 */
export type InventoryEventType = 'OBSERVATION' | 'MISSED_READ' | 'RECEIPT_READ';
/**
 * Canal de captura. Hoy todos los eventos son SIMULADOS; los mismos canales se conectarán a equipos reales:
 * portal fijo (lector + antenas en el andén), lector de mano RFID y, más adelante, beacons BLE.
 */
export type ReadChannel = 'RFID_PORTAL' | 'RFID_HANDHELD' | 'BLE_BEACON';

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
  channel?: ReadChannel;
  readerId?: string;
  antenna?: number;
  /** Código EPC de la etiqueta leída. */
  epc?: string;
  rssi?: number;
  purchaseOrderId?: string;
}

export type DiscrepancyKind = 'LOCATION_MISMATCH' | 'NOT_OBSERVED' | 'RECEIPT_SHORTAGE';

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

export type RecommendationType = 'REVIEW_EXCESS' | 'PRIORITIZE_FEFO' | 'VERIFY_LOCATION' | 'CLAIM_SHORTAGE';
export type RecommendationStatus = 'PROPOSED' | 'APPROVED' | 'REJECTED';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  reason: string;
  skuId: string | null;
  unitId: string | null;
  estimatedImpactUsd: number | null;
  /** Unidades a mover (solo redistribución). */
  quantity?: number | null;
  status: RecommendationStatus;
  assumptions: string[];
}

/** OPEN = pendiente de ejecución · IN_PROGRESS = en ejecución (simulada) · DONE = completada en simulación. */
export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE';

export interface Task {
  id: string;
  recommendationId: string;
  title: string;
  status: TaskStatus;
  owner: string | null;
  skuId?: string | null;
  quantity?: number | null;
  createdAt?: ISODateTime;
}

/**
 * Otra bodega de la misma empresa, fuera del gemelo 3D (solo cifras agregadas, SINTÉTICAS).
 * La demanda diaria es el promedio de despachos a clientes de sus últimos 30 días.
 */
export interface RemoteSite {
  warehouseId: string;
  name: string;
  /** Muelle de la bodega principal por el que salen los traslados hacia esta bodega. */
  dockName: string;
  stockBySku: Record<string, number>;
  dailyDemandBySku: Record<string, number>;
}

/**
 * Traslado interno entre bodegas. NO es venta ni despacho: el stock total de la empresa se conserva.
 * PLANNED → IN_PROGRESS (Simular ejecución) → COMPLETED (Confirmar recepción, explícito).
 */
export type MovementStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

export interface MovementSnapshot { originStock: number; destinationStock: number }

export interface Movement {
  id: string;
  taskId: string;
  recommendationId: string;
  skuId: string;
  quantity: number;
  fromWarehouseId: string;
  toWarehouseId: string;
  /** Pallets completos que se trasladan y sus ubicaciones de origen. */
  unitIds: string[];
  originLocationIds: string[];
  status: MovementStatus;
  plannedAt: ISODateTime;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  receivedQuantity: number | null;
  /** Stock de origen y destino al iniciar la ejecución (para la comparación antes/después). */
  before: MovementSnapshot | null;
  after: MovementSnapshot | null;
  /** Copia de las unidades trasladadas (trazabilidad: dejan el gemelo de origen al confirmarse). */
  shippedUnits: LogisticUnit[];
}

/** Solo despachos a clientes. Las transferencias internas NO son demanda. */
export interface DailyDemand { skuId: string; date: ISODate; dispatchedBaseUnits: number }

/** Transferencias internas entre ubicaciones/bodegas: se registran pero se excluyen de la demanda. */
export interface InternalTransfer { skuId: string; date: ISODate; baseUnits: number; note: string }

export interface SkuPolicy { skuId: string; targetCoverageDays: number }

/** Caja anunciada por el proveedor (aviso de envío): su etiqueta EPC y su contenido. */
export interface AsnBox { boxId: string; epc: string; qty: number }

/** Orden de compra en recepción. El inventario solo suma las cajas cuya etiqueta se leyó. */
export interface PurchaseOrder {
  id: string;
  supplier: string;
  skuId: string;
  lotId: string;
  palletId: string;
  dockLocationId: string;
  expectedAt: ISODateTime;
  boxes: AsnBox[];
  status: 'EXPECTED' | 'RECEIVING' | 'CLOSED';
  receivedBoxIds: string[];
  /** Lecturas totales (incluye lecturas repetidas de la misma etiqueta). */
  readCount: number;
  closedAt: ISODateTime | null;
}

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
  purchaseOrders: PurchaseOrder[];
  remoteSites: RemoteSite[];
}
