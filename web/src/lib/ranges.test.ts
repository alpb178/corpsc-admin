import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET, lastDays, presetFrom, resolveRange, shiftDay, today } from './ranges';

// 02:00 UTC on the 10th is still the 9th in La Paz (UTC−4).
const NOW = new Date('2026-09-10T02:00:00Z');

describe('ranges', () => {
  it("uses the group's calendar for today", () => {
    expect(today(NOW)).toBe('2026-09-09');
  });

  it('shifts days without going through local time', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('ends every range today', () => {
    expect(lastDays(7, NOW)).toEqual({ from: '2026-09-03', to: '2026-09-09' });
    expect(resolveRange('today', NOW)).toEqual({ from: '2026-09-09', to: '2026-09-09' });
    expect(resolveRange('12m', NOW).from).toBe('2025-09-10');
  });

  it('falls back to the default for an unknown preset', () => {
    expect(resolveRange('nope', NOW)).toEqual(resolveRange(DEFAULT_PRESET, NOW));
    expect(presetFrom({ range: 'nope' })).toBe(DEFAULT_PRESET);
    expect(presetFrom(undefined)).toBe(DEFAULT_PRESET);
  });

  it('still reads the pre-rename parameter', () => {
    expect(presetFrom({ rango: '90d' })).toBe('90d');
    expect(presetFrom({ range: 'today' })).toBe('today');
  });
});
