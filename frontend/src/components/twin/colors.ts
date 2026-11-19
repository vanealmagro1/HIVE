// Colores de estado compartidos por la escena 3D, la vista 2D y la leyenda (paleta del análisis estratégico).
import type { VerificationStatus } from '../../domain/types';

export const STATUS_COLOR: Record<VerificationStatus, string> = {
  EXPECTED: '#9fb0ad',
  OBSERVED: '#6f9b3c',
  PENDING_VERIFICATION: '#d98a1c',
  CONFIRMED: '#267c71',
};
