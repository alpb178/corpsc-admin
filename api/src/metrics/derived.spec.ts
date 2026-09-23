import { Aggregation, MetricUnit } from '@prisma/client';
import { withDerived, compare, isImprovement, type MetricMeta } from './derived';

const DEFS: MetricMeta[] = [
  { key: 'orders', label: 'Pedidos', unit: MetricUnit.COUNT, aggregation: Aggregation.SUM, derivedFrom: null },
  { key: 'visits', label: 'Visitas', unit: MetricUnit.COUNT, aggregation: Aggregation.SUM, derivedFrom: null },
  { key: 'page_views', label: 'Páginas vistas', unit: MetricUnit.COUNT, aggregation: Aggregation.SUM, derivedFrom: null },
  { key: 'conversion_rate', label: 'Conversión', unit: MetricUnit.RATIO, aggregation: Aggregation.WEIGHTED_AVG, derivedFrom: { numerator: 'orders', denominator: 'visits' } },
  { key: 'pages_per_visit', label: 'Páginas por visita', unit: MetricUnit.COUNT, aggregation: Aggregation.WEIGHTED_AVG, derivedFrom: { numerator: 'page_views', denominator: 'visits' } },
];

describe('withDerived', () => {
  it('computes the CTR over the sums', () => {
    const out = withDerived({ orders: 50, visits: 1000 }, DEFS);
    expect(out.conversion_rate).toBe(0.05);
  });

  it('weights the average position by impressions', () => {
    // Day 1: position 10 with 100 impressions. Day 2: position 2 with 900.
    // position_sum = 10*100 + 2*900 = 2800; impressions = 1000 → 2.8
    // The plain mean of the daily positions would give 6, which is false: the
    // position-2 day weighs nine times more.
    const out = withDerived({ page_views: 2800, visits: 1000 }, DEFS);
    expect(out.pages_per_visit).toBe(2.8);
    expect(out.pages_per_visit).not.toBe(6);
  });

  it('does not make up a position when the numerator is missing', () => {
    // Real case: a project sends visits but no orders, because nothing is sold
    // there. Showing "conversion rate 0%" suggests someone tried to sell and
    // didn't, and that's not it: there's nothing to convert.
    const out = withDerived({ visits: 5000, orders: 254 }, DEFS);

    expect(out.pages_per_visit).toBeUndefined();
    // The CTR CAN be computed: clicks and impressions are both there.
    expect(out.conversion_rate).toBeCloseTo(0.0508);
  });

  it('a numerator equal to zero DOES produce a ratio', () => {
    // Zero clicks with impressions is a real 0% CTR, not missing data.
    const out = withDerived({ orders: 0, visits: 1000 }, DEFS);
    expect(out.conversion_rate).toBe(0);
  });

  it('does not make up a ratio when there is no denominator', () => {
    // "0% CTR" and "there were no impressions" are different things; returning
    // 0 would draw a drop that never happened.
    const out = withDerived({ orders: 0, visits: 0 }, DEFS);
    expect(out.conversion_rate).toBeUndefined();
  });

  it('leaves the incoming metrics untouched', () => {
    const out = withDerived({ orders: 50, visits: 1000 }, DEFS);
    expect(out.orders).toBe(50);
    expect(out.visits).toBe(1000);
  });
});

describe('compare', () => {
  it('computes the relative change', () => {
    const deltas = compare({ sessions: 120 }, { sessions: 100 });
    expect(deltas.sessions).toEqual({ current: 120, previous: 100, change: 0.2 });
  });

  it('detects decreases', () => {
    expect(compare({ sessions: 80 }, { sessions: 100 }).sessions.change).toBeCloseTo(-0.2);
  });

  it('returns no percentage when starting from zero', () => {
    // Going from 0 to 5 isn't "+∞" or "+100%": it's an appearance, and the
    // dashboard must present it as such and not with a giant green arrow.
    expect(compare({ sessions: 5 }, { sessions: 0 }).sessions.change).toBeNull();
  });

  it('covers metrics present in only one of the periods', () => {
    const deltas = compare({ a: 1 }, { b: 2 });
    expect(deltas.a).toEqual({ current: 1, previous: 0, change: null });
    expect(deltas.b).toEqual({ current: 0, previous: 2, change: -1 });
  });
});

describe('isImprovement', () => {
  it('more is better in the normal case', () => {
    expect(isImprovement('sessions', 0.2)).toBe(true);
    expect(isImprovement('sessions', -0.2)).toBe(false);
  });

  it('for cancellations, less is better', () => {
    // Cancellations going down is good news. Without this the panel would
    // paint green exactly what needs fixing.
    expect(isImprovement('orders_cancelled', -0.4)).toBe(true);
    expect(isImprovement('orders_cancelled', 0.4)).toBe(false);
  });

  it('takes no stance when there is no change', () => {
    expect(isImprovement('sessions', null)).toBeNull();
    expect(isImprovement('sessions', 0)).toBeNull();
  });
});
