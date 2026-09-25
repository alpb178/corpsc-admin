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
  /** Slot 1..8 of the validated palette. The order is the colour-blind
   *  guarantee, so it's assigned per entity and never by position in the
   *  ranking: filtering series must not repaint the ones that remain. */
  slot: number;
}

interface Props {
  data: Array<Record<string, string | number | null>>;
  series: TrendSeries[];
  unit?: Unit;
  height?: number;
}

export function TrendChart({ data, series, unit = 'COUNT', height = 260 }: Props) {
  const single = series.length === 1;

  return (
    <div>
      {/* With a single series there's no legend: the title already names it.
          With two or more there always is one, so identity doesn't depend on
          colour. */}
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
            {/* Recessive grid and axes: they're reference, not content. */}
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
              // Counts have no fractions: without this, a series that only
              // reaches 1 gets ticks at 0.25, 0.5… that all round to 0 or 1.
              // Rates and averages do, so they keep decimal ticks.
              allowDecimals={unit !== 'COUNT'}
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
                  <div className="card px-3 py-2 shadow-lg">
                    <p className="text-[12px] font-medium text-fg">{formatFullDate(String(label))}</p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {payload.map((entry) => (
                        <li key={String(entry.dataKey)} className="flex items-center gap-2 text-[12px]">
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: entry.color }}
                          />
                          {/* Text uses text tokens; the colour is carried by
                              the swatch next to it, not the figure. */}
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
                // Straight, not curved: smoothing invents in-between values
                // that no day ever had.
                type="linear"
                dataKey={s.key}
                name={s.label}
                stroke={`var(--series-${s.slot})`}
                strokeWidth={2}
                // No dots on a continuous line, but a day with no neighbours
                // has no segment to draw: without its own dot it disappears.
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const { cx, cy, index = 0 } = props;
                  const isolated =
                    data[index]?.[s.key] != null &&
                    data[index - 1]?.[s.key] == null &&
                    data[index + 1]?.[s.key] == null;
                  return isolated && cx != null && cy != null ? (
                    <circle key={`${s.key}-${index}`} cx={cx} cy={cy} r={3} fill={`var(--series-${s.slot})`} />
                  ) : (
                    <g key={`${s.key}-${index}`} />
                  );
                }}
                // 8 px marker on hover, with a surface-coloured ring so it
                // stands out from the line.
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                // Gaps are drawn as gaps: joining day 3 to day 7 with a
                // straight line would suggest a trend that never happened.
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
