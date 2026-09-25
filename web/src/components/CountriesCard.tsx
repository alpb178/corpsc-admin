import { RankList, rankRows } from './RankBar';
import { WorldMap } from './WorldMap';
import { formatMetric } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

interface Props {
  slices: DimensionSlice[];
  title?: string;
  limit?: number;
}

/**
 * Countries as a map with the ranked list beside it. The map gives the
 * picture at a glance; the list carries the figures, flag by flag, so the
 * card reads without hovering and without telling shades apart.
 */
export function CountriesCard({ slices, title = 'Países', limit = 6 }: Props) {
  const { rows, total, max } = rankRows(slices, 'visits', limit);
  const mapped = slices
    .filter((s) => /^[A-Z]{2}$/.test(s.value) && (s.metrics.visits ?? 0) > 0)
    .map((s) => ({ code: s.value, value: s.metrics.visits ?? 0 }));

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {rows.length > 0 ? (
          <p className="tabular text-[12px] text-fg-faint">
            {mapped.length} {mapped.length === 1 ? 'país' : 'países'} · {formatMetric(total)} en total
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-fg-faint">Sin datos en este periodo.</p>
      ) : (
        <div className="mt-3 grid items-center gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {mapped.length > 0 ? <WorldMap countries={mapped} /> : null}
          <RankList rows={rows} total={total} max={max} kind="country" />
        </div>
      )}
    </section>
  );
}
