import { compact, formatMetric, labelDimension, type Unit } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

interface Props {
  title: string;
  slices: DimensionSlice[];
  metricKey: string;
  unit?: Unit;
  /** Métrica secundaria que se muestra a la derecha (por ejemplo, el CTR). */
  secondary?: { key: string; unit: Unit; label: string };
  limit?: number;
  emptyHint?: string;
}

/**
 * Barras horizontales ordenadas: comparar magnitudes.
 *
 * Una sola tinta, no ocho: la pregunta es "cuánto", no "cuál es cuál", y
 * repartir colores aquí gastaría la paleta categórica sin aportar nada.
 * El valor va escrito al final de cada barra, de modo que el dato se lee sin
 * depender del color ni de medir contra un eje.
 *
 * En HTML y no en una librería de gráficos porque los nombres largos —una
 * consulta de búsqueda, una URL— se truncan mucho mejor con CSS.
 */
export function RankBar({ title, slices, metricKey, unit = 'COUNT', secondary, limit = 8, emptyHint }: Props) {
  // `amount` y no `value`: DimensionSlice.value es la etiqueta de la dimensión
  // (el país, la consulta), y sobrescribirla dejaría las filas sin nombre.
  const rows = slices
    .map((s) => ({ label: s.value, metrics: s.metrics, amount: s.metrics[metricKey] ?? 0 }))
    .filter((r) => r.amount > 0)
    .slice(0, limit);

  const max = Math.max(...rows.map((r) => r.amount), 1);

  return (
    <section className="rounded-[6px] border border-line bg-card p-4">
      <h3 className="text-[13px] font-semibold text-fg">{title}</h3>

      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-faint">{emptyHint ?? 'Sin datos en este periodo.'}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
              <span className="truncate text-[13px] text-fg-muted" title={labelDimension(row.label)}>
                {labelDimension(row.label)}
              </span>

              <span className="tabular flex items-baseline gap-2 text-[13px] font-medium text-fg">
                {formatMetric(row.amount, unit)}
                {secondary ? (
                  <span className="tabular text-[12px] font-normal text-fg-faint">
                    {formatMetric(row.metrics[secondary.key], secondary.unit)}
                  </span>
                ) : null}
              </span>

              <div className="col-span-2 h-[6px] overflow-hidden rounded-[3px] bg-[var(--grid)]">
                <div
                  className="h-full rounded-[3px] bg-[var(--seq-4)]"
                  style={{ width: `${Math.max(2, (row.amount / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {secondary && rows.length > 0 ? (
        <p className="mt-3 text-[11px] text-fg-faint">
          La segunda cifra es {secondary.label.toLowerCase()}. Escala relativa al máximo de la lista
          ({compact(max)}).
        </p>
      ) : null}
    </section>
  );
}
