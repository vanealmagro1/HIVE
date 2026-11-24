// Colores del gemelo (HIVE UI v1.1). En estado normal las cajas muestran el color del producto
// (cartón o azul); el color de estado solo aparece en excepciones.
//   Seleccionado → morado · Por verificar → ámbar · Discrepancia confirmada → rojo · Verificado → verde.
//   Una simple detección NO confirmada nunca se pinta de rojo.
import type { VerificationStatus } from '../../domain/types';

export const EVENT_COLOR = {
  selected: '#7c4dff',
  pending: '#f59e0b',
  confirmed: '#ef4444',
  verified: '#16a34a',
} as const;

/** Familias "azules" (tecnología, oficina, consumibles); el resto, cartón. */
const BLUE_FAMILIES = new Set(['TEC', 'ACC', 'CAL', 'OFI', 'TIN', 'RES']);
export const CARTON = '#d7a86e';
export const BLUE = '#5f7fe0';
export const familyColor = (skuId: string | null | undefined) => (skuId && BLUE_FAMILIES.has(skuId.slice(0, 3)) ? BLUE : CARTON);

/** Color de estado para leyendas y la vista 2D. */
export const STATUS_COLOR: Record<VerificationStatus, string> = {
  EXPECTED: '#b8c0cc',
  OBSERVED: '#8fa3c7',
  PENDING_VERIFICATION: EVENT_COLOR.pending,
  CONFIRMED: EVENT_COLOR.verified,
};
