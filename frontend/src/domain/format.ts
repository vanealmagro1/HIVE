// Formato determinista (independiente del locale del navegador): miles con '.', decimales con ','.
export function formatNumber(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped}${dec ? `,${dec}` : ''}`;
}

export const formatUsd = (value: number): string => `USD ${formatNumber(value)}`;
