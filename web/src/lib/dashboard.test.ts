import { describe, expect, it } from 'vitest';
import { acquisitionRows, topPageSlices, trafficByProject, visitorsHint, visitsAndVisitors } from './dashboard';
import type { Overview } from './types';

function overview(overrides: Partial<Overview> = {}): Overview {
  return {
    range: { from: '2026-09-01', to: '2026-09-03' },
    totals: { visits: 30 },
    split: { own: {}, client: {} },
    series: [
      { date: '2026-09-01', metrics: { visits: 10 } },
      { date: '2026-09-02', metrics: {} },
      { date: '2026-09-03', metrics: { visits: 20 } },
    ],
    seriesByProject: [],
    projects: [],
    visitors: { unique: 12, new: 5, returning: 7, since: '2026-09-01', daily: [
      { date: '2026-09-01', value: 8 },
      { date: '2026-09-03', value: 6 },
    ] },
    counts: { activeProjects: 1, countries: 2, sources: 3 },
    breakdowns: { country: [], channel: [], source: [], device: [], event: [] },
    topPages: [],
    ...overrides,
  };
}

describe('visitsAndVisitors', () => {
  it('puts visits and unique visitors on the same days, with gaps where there is nothing', () => {
    const { data, series } = visitsAndVisitors(overview());

    expect(series.map((s) => [s.key, s.slot])).toEqual([['visits', 1], ['visitors', 2]]);
    expect(data).toEqual([
      { date: '2026-09-01', visits: 10, visitors: 8 },
      { date: '2026-09-02', visits: null, visitors: null },
      { date: '2026-09-03', visits: 20, visitors: 6 },
    ]);
  });

  it('draws only visits while no site identifies visitors', () => {
    const { data, series } = visitsAndVisitors(
      overview({ visitors: { unique: 0, new: 0, returning: 0, since: null, daily: [] } }),
    );

    expect(series.map((s) => s.key)).toEqual(['visits']);
    expect(data[0]).not.toHaveProperty('visitors');
  });
});

describe('trafficByProject', () => {
  const points = (values: Array<number | null>) =>
    values.map((value, i) => ({ date: `2026-09-0${i + 1}`, value }));

  it('makes one line per site, day by day', () => {
    const { data, series } = trafficByProject(
      [
        { slug: 'corpsc', name: 'CORPSC', points: points([3, null]) },
        { slug: 'take', name: 'Take', points: points([1, 4]) },
      ],
      ['corpsc', 'take', 'invoices'],
    );

    expect(data).toEqual([
      { date: '2026-09-01', corpsc: 3, take: 1 },
      { date: '2026-09-02', corpsc: null, take: 4 },
    ]);
    expect(series).toEqual([
      { key: 'corpsc', label: 'CORPSC', slot: 1 },
      { key: 'take', label: 'Take', slot: 2 },
    ]);
  });

  it('keeps each site its colour when another one has no traffic', () => {
    const { series } = trafficByProject(
      [{ slug: 'invoices', name: 'Invoices', points: points([1]) }],
      ['corpsc', 'take', 'invoices'],
    );

    expect(series[0].slot).toBe(3);
  });

  it('is empty without sites', () => {
    expect(trafficByProject([], ['corpsc'])).toEqual({ data: [], series: [] });
  });
});

describe('topPageSlices', () => {
  it('names each page with its site', () => {
    expect(
      topPageSlices([{ project: { slug: 'take', name: 'Take' }, path: '/es', pageViews: 9 }]),
    ).toEqual([{ value: 'Take · /es', metrics: { page_views: 9 } }]);
  });
});

describe('visitorsHint', () => {
  it('explains an empty tile before the sites send v2', () => {
    expect(visitorsHint(null, '2026-09-01')).toBe('llega con el tracker v2');
  });

  it('says from which day there are visitors when that is inside the range', () => {
    expect(visitorsHint('2026-09-15', '2026-09-01')).toBe('desde 15/09');
    expect(visitorsHint('2026-08-01', '2026-09-01')).toBeUndefined();
  });
});

describe('acquisitionRows', () => {
  it('splits channel, source and landing, and drops the rest-of-top bucket', () => {
    expect(
      acquisitionRows([
        { value: 'Organic Search | google.com | /es/servicios', metrics: { visits: 4 } },
        { value: '__other__', metrics: { visits: 9 } },
        { value: 'Referral | a.com | /x | y', metrics: { visits: 1 } },
        { value: 'Direct | __direct__ | /', metrics: { visits: 0 } },
        { value: 'Broken', metrics: { visits: 2 } },
      ]),
    ).toEqual([
      { channel: 'Organic Search', source: 'google.com', landing: '/es/servicios', visits: 4 },
      // A pipe inside the landing survives the split.
      { channel: 'Referral', source: 'a.com', landing: '/x | y', visits: 1 },
    ]);
  });
});
