import { addMonthsUtc, daysInMonthUtc } from './date-math';

describe('addMonthsUtc (UTC, end-of-month clamping)', () => {
  it('clamps Jan 31 + 1 month to Feb 28 in a non-leap year', () => {
    const d = addMonthsUtc(new Date(Date.UTC(2026, 0, 31, 10, 30)), 1);
    expect(d.toISOString()).toBe('2026-02-28T10:30:00.000Z');
  });

  it('clamps Jan 31 + 1 month to Feb 29 in a leap year', () => {
    const d = addMonthsUtc(new Date(Date.UTC(2024, 0, 31, 23, 59, 59)), 1);
    expect(d.toISOString()).toBe('2024-02-29T23:59:59.000Z');
  });

  it('clamps Feb 29 2024 + 12 months to Feb 28 2025', () => {
    const d = addMonthsUtc(new Date(Date.UTC(2024, 1, 29, 12, 0, 0)), 12);
    expect(d.toISOString()).toBe('2025-02-28T12:00:00.000Z');
  });

  it('keeps Feb 29 when the target year is also leap', () => {
    const d = addMonthsUtc(new Date(Date.UTC(2024, 1, 29, 12, 0, 0)), 48);
    expect(d.toISOString()).toBe('2028-02-29T12:00:00.000Z');
  });

  it('normal month adds keep the day', () => {
    const d = addMonthsUtc(new Date(Date.UTC(2026, 10, 15, 8, 0)), 6);
    expect(d.toISOString()).toBe('2027-05-15T08:00:00.000Z');
  });

  it('handles year overflow across December', () => {
    const d = addMonthsUtc(new Date(Date.UTC(2026, 11, 15, 8, 0)), 3);
    expect(d.toISOString()).toBe('2027-03-15T08:00:00.000Z');
  });

  it('daysInMonthUtc knows leap years', () => {
    expect(daysInMonthUtc(2024, 1)).toBe(29);
    expect(daysInMonthUtc(2026, 1)).toBe(28);
    expect(daysInMonthUtc(2026, 0)).toBe(31);
  });
});
