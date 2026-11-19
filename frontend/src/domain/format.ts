// Formato determinista (independiente del locale del navegador): miles con '.', decimales con ','.
export function formatNumber(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

/** Montos en USD: sin decimales si son enteros (USD 2.400), con centavos si no (USD 86,40). */
export const formatUsd = (value: number): string => {
  const cents = Math.round(value * 100) / 100;
  return `USD ${formatNumber(cents, Number.isInteger(cents) ? 0 : 2)}`;
};
