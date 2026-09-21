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
  it('calcula el CTR sobre las sumas', () => {
    const out = withDerived({ orders: 50, visits: 1000 }, DEFS);
    expect(out.conversion_rate).toBe(0.05);
  });

  it('la posición media sale ponderada por impresiones', () => {
    // Día 1: posición 10 con 100 impresiones. Día 2: posición 2 con 900.
    // position_sum = 10*100 + 2*900 = 2800; impresiones = 1000 → 2.8
    // La media simple de las posiciones diarias daría 6, que es falso: el día
    // de la posición 2 pesa nueve veces más.
    const out = withDerived({ page_views: 2800, visits: 1000 }, DEFS);
    expect(out.pages_per_visit).toBe(2.8);
    expect(out.pages_per_visit).not.toBe(6);
  });

  it('no inventa una posición cuando falta el numerador', () => {
    // Caso real: un proyecto envía visitas pero no pedidos, porque allí no se
    // vende nada. Mostrar "tasa de conversión 0%" sugiere que se intentó
    // vender y no se vendió, y no es eso: no hay nada que convertir.
    const out = withDerived({ visits: 5000, orders: 254 }, DEFS);

    expect(out.pages_per_visit).toBeUndefined();
    // El CTR sí se puede calcular: clics e impresiones están los dos.
    expect(out.conversion_rate).toBeCloseTo(0.0508);
  });

  it('un numerador que vale cero SÍ produce ratio', () => {
    // Cero clics con impresiones es un CTR del 0% real, no un dato ausente.
    const out = withDerived({ orders: 0, visits: 1000 }, DEFS);
    expect(out.conversion_rate).toBe(0);
  });

  it('no inventa un ratio cuando no hay denominador', () => {
    // "CTR del 0%" y "no hubo impresiones" son cosas distintas; devolver 0
    // pintaría una caída que nunca ocurrió.
    const out = withDerived({ orders: 0, visits: 0 }, DEFS);
    expect(out.conversion_rate).toBeUndefined();
  });

  it('no toca las métricas que ya venían', () => {
    const out = withDerived({ orders: 50, visits: 1000 }, DEFS);
    expect(out.orders).toBe(50);
    expect(out.visits).toBe(1000);
  });
});

describe('compare', () => {
  it('calcula la variación relativa', () => {
    const deltas = compare({ sessions: 120 }, { sessions: 100 });
    expect(deltas.sessions).toEqual({ current: 120, previous: 100, change: 0.2 });
  });

  it('detecta las bajadas', () => {
    expect(compare({ sessions: 80 }, { sessions: 100 }).sessions.change).toBeCloseTo(-0.2);
  });

  it('no devuelve porcentaje cuando se parte de cero', () => {
    // Pasar de 0 a 5 no es "+∞" ni "+100%": es una aparición, y el dashboard
    // debe presentarlo como tal y no con una flecha verde gigante.
    expect(compare({ sessions: 5 }, { sessions: 0 }).sessions.change).toBeNull();
  });

  it('cubre las métricas que solo están en uno de los periodos', () => {
    const deltas = compare({ a: 1 }, { b: 2 });
    expect(deltas.a).toEqual({ current: 1, previous: 0, change: null });
    expect(deltas.b).toEqual({ current: 0, previous: 2, change: -1 });
  });
});

describe('isImprovement', () => {
  it('más es mejor en lo normal', () => {
    expect(isImprovement('sessions', 0.2)).toBe(true);
    expect(isImprovement('sessions', -0.2)).toBe(false);
  });

  it('en las cancelaciones, menos es mejor', () => {
    // Que bajen las cancelaciones es una buena noticia. Sin esto el panel
    // pintaría en verde justo lo que hay que corregir.
    expect(isImprovement('orders_cancelled', -0.4)).toBe(true);
    expect(isImprovement('orders_cancelled', 0.4)).toBe(false);
  });

  it('no se moja si no hay variación', () => {
    expect(isImprovement('sessions', null)).toBeNull();
    expect(isImprovement('sessions', 0)).toBeNull();
  });
});
