import { describe, expect, it } from 'vitest';
import {
  compact,
  formatAgo,
  formatChange,
  formatDay,
  formatShare,
  formatShortDay,
  formatDuration,
  formatFullDate,
  formatMetric,
  labelDimension,
  labelEventType,
  labelLanguage,
  labelRegion,
  labelScreen,
} from './format';

// es-BO separators: normalise spaces so the assertions don't depend on the ICU build.
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('formatMetric', () => {
  it('shows a missing figure as a dash, never as zero', () => {
    expect(formatMetric(undefined)).toBe('—');
    expect(formatMetric(Number.NaN)).toBe('—');
  });

  it('formats by unit', () => {
    expect(plain(formatMetric(12345))).toMatch(/^12.345$/);
    expect(plain(formatMetric(0.1234, 'RATIO'))).toMatch(/12,3 ?%/);
    expect(formatMetric(1.84, 'AVERAGE')).toBe('1,8');
    expect(formatMetric(3.25, 'POSITION')).toBe('3,3');
    expect(formatMetric(95, 'SECONDS')).toBe('1 min');
  });
});

describe('compact', () => {
  it('shortens axis figures', () => {
    expect(plain(compact(12_400))).toBe('12,4 k');
    expect(plain(compact(2_500_000))).toBe('2,5 M');
    expect(compact(12)).toBe('12');
  });
});

describe('formatDuration', () => {
  it('reads in the largest sensible unit', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(3_900)).toBe('1 h 5 min');
  });
});

describe('formatChange', () => {
  it('says there is no base instead of an infinite rise', () => {
    expect(formatChange(null)).toBe('sin base');
    expect(plain(formatChange(0.12))).toMatch(/^\+12 ?%$/);
  });
});

describe('dates', () => {
  it('formats ISO days in UTC, so they never shift a day', () => {
    expect(formatDay('2026-09-01')).toMatch(/1.*sept?/i);
    expect(formatShortDay('2026-09-01')).toBe('1/9');
  });

  it('writes a share as whole percent and never as 0 %', () => {
    expect(formatShare(0.404)).toMatch(/^40\s?%$/);
    expect(formatShare(1)).toMatch(/^100\s?%$/);
    expect(formatShare(0.002)).toMatch(/^< 1\s?%$/);
    expect(formatShare(0)).toMatch(/^0\s?%$/);
    expect(formatFullDate('2026-09-01')).toMatch(/1 de septiembre de 2026/);
  });
});

describe('labelDimension', () => {
  it('translates reserved values, devices and channels', () => {
    expect(labelDimension('__unknown__')).toBe('Desconocido');
    expect(labelDimension('__direct__')).toBe('Directo');
    expect(labelDimension('mobile')).toBe('Móvil');
    expect(labelDimension('Organic Social')).toBe('Redes sociales');
  });

  it('names countries from their ISO code and leaves the rest as it is', () => {
    expect(labelDimension('BO')).toBe('Bolivia');
    expect(labelDimension('XX')).toBe('XX');
    expect(labelDimension('/es/precios')).toBe('/es/precios');
  });
});

describe('labelLanguage, labelScreen, labelRegion', () => {
  it('names languages, screen buckets and regions with their country', () => {
    expect(labelLanguage('es')).toBe('español');
    expect(labelLanguage('__unknown__')).toBe('Desconocido');
    expect(labelLanguage('not a code')).toBe('not a code');
    expect(labelScreen('xs')).toBe('Móvil (< 576 px)');
    expect(labelScreen('__unknown__')).toBe('Desconocido');
    expect(labelRegion('BO-L')).toBe('L · Bolivia');
    expect(labelRegion('__unknown__')).toBe('Desconocido');
  });
});

describe('formatAgo and labelEventType', () => {
  const now = Date.parse('2026-09-24T15:00:00Z');
  it.each([
    [5_000, 'hace 5 s'],
    [150_000, 'hace 2 min'],
    [3 * 3_600_000, 'hace 3 h'],
    [50 * 3_600_000, 'hace 2 d'],
    [-4_000, 'hace 0 s'],
  ])('%i ms ago reads "%s"', (ago, text) => {
    expect(formatAgo(new Date(now - ago).toISOString(), now)).toBe(text);
  });

  it('reads event types in words', () => {
    expect(labelEventType('page_view')).toBe('Visita a');
    expect(labelEventType('site_click')).toBe('Salida a otro sitio desde');
    expect(labelEventType('mystery')).toBe('mystery');
  });
});
