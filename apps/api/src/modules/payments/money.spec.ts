import { Prisma } from '@prisma/client';
import { amountsEqual, formatETB, toDecimal } from './money';

describe('money helpers (decimal-safe, no float)', () => {
  it('parses strings, numbers and Decimals', () => {
    expect(toDecimal('1000')?.toString()).toBe('1000');
    expect(toDecimal(1000)?.toString()).toBe('1000');
    expect(toDecimal(new Prisma.Decimal('99.99'))?.toString()).toBe('99.99');
    expect(toDecimal('garbage')).toBeNull();
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
  });

  it('compares numerically without float drift: 1000 == 1000.00, but not 1000.01', () => {
    expect(amountsEqual('1000', new Prisma.Decimal('1000.00'))).toBe(true);
    expect(amountsEqual(1000, '1000')).toBe(true);
    expect(amountsEqual('1000', '1000.01')).toBe(false);
    expect(amountsEqual('499.99', '500')).toBe(false);
    // classic float trap: 0.1 + 0.2 !== 0.3 in float; decimals must not care
    expect(amountsEqual('0.3', '0.1+0.2')).toBe(false); // invalid string → null
    expect(amountsEqual('19.99', '19.99')).toBe(true);
    expect(amountsEqual(null, '1')).toBe(false);
  });

  it('formats ETB with exactly 2 decimals', () => {
    expect(formatETB('1000')).toBe('1000.00');
    expect(formatETB(500.5)).toBe('500.50');
    expect(formatETB(new Prisma.Decimal('0.1'))).toBe('0.10');
    expect(() => formatETB('abc')).toThrow();
  });
});
