import type { Aggregation, MetricUnit } from '@prisma/client';

/**
 * Definición de métrica tal y como la necesita la capa de lectura.
 * Es el espejo en memoria de la tabla `metric_definition`.
 */
export interface MetricMeta {
  key: string;
  label: string;
  unit: MetricUnit;
  aggregation: Aggregation;
  derivedFrom: { numerator: string; denominator: string } | null;
}

export type MetricTotals = Record<string, number>;

/**
 * Añade las métricas derivadas a un conjunto de totales ya sumados.
 *
 * Esta función es la razón de ser de la regla "solo se persisten medidas
 * aditivas". Una tasa de conversión guardada por día no se puede promediar
 * entre días: la media de las tasas diarias NO es la tasa del periodo, porque
 * cada día pesa distinto. Aquí se calcula sobre las sumas, que es la única
 * forma correcta:
 *
 *   conversion_rate = Σ pedidos / Σ visitas
 *   pages_per_visit = Σ páginas / Σ visitas
 */
export function withDerived(totals: MetricTotals, definitions: MetricMeta[]): MetricTotals {
  const out: MetricTotals = { ...totals };

  for (const def of definitions) {
    if (!def.derivedFrom) continue;

    const numerator = totals[def.derivedFrom.numerator];
    const denominator = totals[def.derivedFrom.denominator];

    // Sin denominador no hay ratio. Devolver 0 sería mentir: "CTR del 0%" y
    // "no hubo impresiones" son cosas distintas, y el dashboard debe poder
    // distinguirlas para no pintar una caída que no existió.
    if (!denominator) continue;

    // Un numerador AUSENTE tampoco es un numerador a cero. Pasa de verdad: un
    // proyecto envía visitas pero no pedidos porque allí no se vende nada.
    // Sin esta comprobación el panel mostraría "tasa de conversión 0%", que
    // sugiere que se intentó vender y no se vendió — y no es eso.
    if (numerator === undefined) continue;

    out[def.key] = numerator / denominator;
  }

  return out;
}

/** Variación relativa entre dos periodos. */
export interface Delta {
  current: number;
  previous: number;
  /** Fracción: 0.12 es +12%. `null` cuando no se puede calcular. */
  change: number | null;
}

/**
 * Compara dos periodos métrica a métrica.
 *
 * Cuando el periodo anterior es 0 no se devuelve "+∞" ni "+100%": pasar de 0 a
 * 5 no es un porcentaje, es una aparición, y el dashboard debe presentarlo como
 * tal en lugar de con una flecha verde gigante.
 */
export function compare(current: MetricTotals, previous: MetricTotals): Record<string, Delta> {
  const keys = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const out: Record<string, Delta> = {};

  for (const key of keys) {
    const now = current[key] ?? 0;
    const before = previous[key] ?? 0;
    out[key] = { current: now, previous: before, change: before === 0 ? null : (now - before) / before };
  }

  return out;
}

/**
 * Métricas en las que "menos es mejor": que bajen es una buena noticia.
 *
 * Sin esto el panel pintaría en verde una subida de cancelaciones. Cualquier
 * métrica nueva de este tipo —devoluciones, rebotes, incidencias— hay que
 * añadirla aquí o se leerá al revés.
 */
const LOWER_IS_BETTER = new Set(['orders_cancelled']);

export function isImprovement(metricKey: string, change: number | null): boolean | null {
  if (change === null || change === 0) return null;
  return LOWER_IS_BETTER.has(metricKey) ? change < 0 : change > 0;
}
