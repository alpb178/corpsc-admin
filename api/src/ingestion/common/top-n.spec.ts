import { collapseToTopN, normalizeUrl } from './top-n';
import { OTHER, type MetricRow } from './metric-row';

function row(date: string, dimValue: string, value: number, metricKey = 'sessions'): MetricRow {
  return { date, metricKey, dimension: 'country', dimValue, value };
}

describe('collapseToTopN', () => {
  it('keeps the top-N and sums the rest into __other__', () => {
    const rows = [
      row('2026-03-01', 'BO', 100),
      row('2026-03-01', 'AR', 50),
      row('2026-03-01', 'CL', 10),
      row('2026-03-01', 'PE', 5),
    ];

    const out = collapseToTopN(rows, { dimension: 'country', topN: 2, rankBy: 'sessions' });
    const byValue = Object.fromEntries(out.map((r) => [r.dimValue, r.value]));

    expect(byValue).toEqual({ BO: 100, AR: 50, [OTHER]: 15 });
  });

  it('the breakdown still adds up to the total (which is what __other__ is for)', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row('2026-03-01', `pais-${i}`, i + 1));
    const total = rows.reduce((n, r) => n + r.value, 0);

    const out = collapseToTopN(rows, { dimension: 'country', topN: 10, rankBy: 'sessions' });

    expect(out.reduce((n, r) => n + r.value, 0)).toBe(total);
  });

  it('does not create __other__ when everything fits in the top', () => {
    const rows = [row('2026-03-01', 'BO', 100), row('2026-03-01', 'AR', 50)];
    const out = collapseToTopN(rows, { dimension: 'country', topN: 10, rankBy: 'sessions' });

    expect(out.some((r) => r.dimValue === OTHER)).toBe(false);
  });

  it('decides the top per day, not for the whole range', () => {
    // A country can lead one day and not the next; if the top were decided
    // for the whole range, the weak day would lose its own leader.
    const rows = [
      row('2026-03-01', 'BO', 100),
      row('2026-03-01', 'AR', 1),
      row('2026-03-02', 'AR', 100),
      row('2026-03-02', 'BO', 1),
    ];

    const out = collapseToTopN(rows, { dimension: 'country', topN: 1, rankBy: 'sessions' });

    expect(out.filter((r) => r.date === '2026-03-01' && r.dimValue === 'BO')).toHaveLength(1);
    expect(out.filter((r) => r.date === '2026-03-02' && r.dimValue === 'AR')).toHaveLength(1);
  });

  it('carries every metric of the rows that go to __other__', () => {
    const rows = [
      row('2026-03-01', 'BO', 100),
      row('2026-03-01', 'CL', 5),
      row('2026-03-01', 'CL', 3, 'new_users'),
      row('2026-03-01', 'PE', 2, 'new_users'),
    ];

    const out = collapseToTopN(rows, { dimension: 'country', topN: 1, rankBy: 'sessions' });
    const other = out.filter((r) => r.dimValue === OTHER);

    expect(other.find((r) => r.metricKey === 'sessions')?.value).toBe(5);
    expect(other.find((r) => r.metricKey === 'new_users')?.value).toBe(5);
  });

  it('ignores rows from other dimensions', () => {
    const rows = [row('2026-03-01', 'BO', 100), { ...row('2026-03-01', 'movil', 7), dimension: 'device' }];
    const out = collapseToTopN(rows, { dimension: 'country', topN: 10, rankBy: 'sessions' });

    expect(out).toHaveLength(1);
  });
});

describe('normalizeUrl', () => {
  it('strips the own host and keeps the path', () => {
    expect(normalizeUrl('https://tu-chamba.corpsc.com/ofertas/123', 'tu-chamba.corpsc.com')).toBe(
      '/ofertas/123',
    );
  });

  it('keeps the host when it belongs to another domain', () => {
    expect(normalizeUrl('https://otro.com/x', 'tu-chamba.corpsc.com')).toBe('otro.com/x');
  });

  it('drops campaign parameters but keeps the ones that change the page', () => {
    // Without this, the same page shows up dozens of times as different rows.
    expect(normalizeUrl('https://x.com/ofertas?utm_source=fb&utm_campaign=marzo&page=2', 'x.com')).toBe(
      '/ofertas?page=2',
    );
  });

  it('truncates to 512 characters so the column does not overflow', () => {
    const long = `https://x.com/${'a'.repeat(900)}`;
    expect(normalizeUrl(long, 'x.com').length).toBe(512);
  });

  it('lets through anything that is not a URL', () => {
    expect(normalizeUrl('/ruta/suelta')).toBe('/ruta/suelta');
  });
});

describe('the rest-of-top bucket and currencies', () => {
  const money = (dimValue: string, value: number, currency: string) => ({
    date: '2026-03-01',
    metricKey: 'revenue',
    dimension: 'product',
    dimValue,
    value,
    currency,
  });

  it('keeps the currency when everything in __other__ shares it', () => {
    const out = collapseToTopN([money('a', 30, 'BOB'), money('b', 20, 'BOB'), money('c', 10, 'BOB')], {
      dimension: 'product',
      topN: 1,
      rankBy: 'revenue',
    });
    expect(out.find((r) => r.dimValue === '__other__')).toMatchObject({ value: 30, currency: 'BOB' });
  });

  it('leaves it without currency when amounts in several fell into __other__', () => {
    const out = collapseToTopN([money('a', 30, 'USD'), money('b', 20, 'USD'), money('c', 10, 'CUP')], {
      dimension: 'product',
      topN: 1,
      rankBy: 'revenue',
    });
    expect(out.find((r) => r.dimValue === '__other__')?.currency).toBeUndefined();
  });
});
