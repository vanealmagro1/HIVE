import { describe, expect, it } from 'vitest';
import { formatNumber, formatUsd } from './format';

describe('formato determinista', () => {
  it('agrupa miles con punto y decimales con coma', () => {
    expect(formatNumber(13599)).toBe('13.599');
    expect(formatNumber(1234.5, 1)).toBe('1.234,5');
  });
  it('USD sin decimales si es entero y con centavos si no', () => {
    expect(formatUsd(2400)).toBe('USD 2.400');
    expect(formatUsd(86.4)).toBe('USD 86,40');
    expect(formatUsd(1.15)).toBe('USD 1,15');
    expect(formatUsd(86.399999)).toBe('USD 86,40');
  });
});
