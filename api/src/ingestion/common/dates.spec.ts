import { addDays, chunkRange, daysBetween, fromUtcDate, isIsoDate, maxDate, minDate, todayIn, toUtcDate } from './dates';

describe('dates', () => {
  it('rejects dates that are well formed but do not exist', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
  });

  it("gives today in the project's zone, not UTC's", () => {
    const now = new Date('2026-09-10T02:00:00Z');
    expect(todayIn('America/La_Paz', now)).toBe('2026-09-09');
    expect(todayIn('Europe/Madrid', now)).toBe('2026-09-10');
  });

  it('counts and shifts calendar days across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-03-01', '2026-02-27')).toBe(-2);
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('orders dates as text', () => {
    expect(minDate('2026-03-01', '2026-02-28')).toBe('2026-02-28');
    expect(maxDate('2026-03-01', '2026-02-28')).toBe('2026-03-01');
  });

  it('round-trips through the Date Postgres stores', () => {
    expect(fromUtcDate(toUtcDate('2026-03-01'))).toBe('2026-03-01');
  });

  it('splits a range into chunks, inclusive', () => {
    expect(chunkRange('2026-03-01', '2026-03-07', 3)).toEqual([
      ['2026-03-01', '2026-03-03'],
      ['2026-03-04', '2026-03-06'],
      ['2026-03-07', '2026-03-07'],
    ]);
    expect(chunkRange('2026-03-02', '2026-03-01', 3)).toEqual([]);
    expect(() => chunkRange('2026-03-01', '2026-03-02', 0)).toThrow();
  });
});
