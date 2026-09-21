'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { compact, formatDay, formatFullDate, formatMetric, type Unit } from '@/lib/format';

export interface TrendSeries {
  key: string;
  label: string;
  /** Slot 1..8 de la paleta validada. El orden es la garantía para
   *  daltonismo, así que se asigna por entidad y nunca por posición en el
   *  ranking: filtrar series no puede repintar a las que quedan. */
  slot: number;
}

interface Props {
  data: Array<Record<string, string | number>>;
  series: TrendSeries[];
  unit?: Unit;
  height?: number;
}

export function TrendChart({ data, series, unit = 'COUNT', height = 260 }: Props) {
  const single = series.length === 1;

  return (
    <div>
      {/* Con una sola serie no hay leyenda: el título ya la nombra. Con dos o
          más siempre la hay, para que la identidad no dependa del color. */}
      {!single ? (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span
                aria-hidden
                className="h-[3px] w-4 rounded-full"
                style={{ background: `var(--series-${s.slot})` }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            {/* Rejilla y ejes recesivos: son referencia, no contenido. */}
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: 'var(--axis)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--grid)' }}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              tickFormatter={compact}
              tick={{ fill: 'var(--axis)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-[6px] border border-line bg-card px-3 py-2 shadow-lg">
                    <p className="text-[12px] font-medium text-fg">{formatFullDate(String(label))}</p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {payload.map((entry) => (
                        <li key={String(entry.dataKey)} className="flex items-center gap-2 text-[12px]">
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: entry.color }}
                          />
                          {/* El texto va con tokens de texto; el color lo lleva
                              la marca de al lado, no la cifra. */}
                          <span className="text-fg-muted">{entry.name}</span>
                          <span className="tabular ml-auto font-medium text-fg">
                            {formatMetric(Number(entry.value), unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                // Recta y no curva: suavizar inventa valores intermedios que
                // ningún día tuvo.
                type="linear"
                dataKey={s.key}
                name={s.label}
                stroke={`var(--series-${s.slot})`}
                strokeWidth={2}
                dot={false}
                // Marcador de 8 px al pasar por encima, con anillo de la
                // superficie para que se despegue de la línea.
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                // Los huecos se dibujan como huecos: unir el día 3 con el 7 en
                // línea recta sugeriría una tendencia que no ocurrió.
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
