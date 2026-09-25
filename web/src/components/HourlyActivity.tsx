import { formatMetric } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

/**
 * Visits by hour of the day, in the project's time zone.
 *
 * Plain HTML columns, like the rank bars: 24 values in one ink, with the
 * busiest hour written out, so it reads without hovering. An hour with no
 * visits keeps its slot — a gap at 04:00 is information, not missing data.
 */
export function HourlyActivity({ slices, timezone }: { slices: DimensionSlice[]; timezone: string }) {
  const byHour = new Map(slices.map((s) => [s.value, s.metrics.visits ?? 0]));
  const values = HOURS.map((hour) => ({ hour, visits: byHour.get(hour) ?? 0 }));
  const max = Math.max(...values.map((v) => v.visits), 1);
  const peak = values.reduce((best, v) => (v.visits > best.visits ? v : best), values[0]);

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-fg">Horario de visitas</h3>
        <p className="text-[12px] text-fg-faint">{timezone}</p>
      </div>

      {peak.visits === 0 ? (
        <p className="mt-3 text-[13px] text-fg-faint">Sin datos en este periodo.</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-fg-muted">
            Hora con más visitas: <strong className="font-semibold text-fg">{peak.hour}:00</strong> ·{' '}
            {formatMetric(peak.visits)}
          </p>
          <div className="mt-3 flex h-28 items-end gap-[3px]" role="list" aria-label="Visitas por hora">
            {values.map((v) => (
              <div
                key={v.hour}
                role="listitem"
                aria-label={`${v.hour}:00 — ${formatMetric(v.visits)} visitas`}
                title={`${v.hour}:00 — ${formatMetric(v.visits)} visitas`}
                className="flex-1 origin-bottom rounded-t-[2px] bg-accent animate-rise motion-reduce:animate-none"
                style={{ height: `${Math.max((v.visits / max) * 100, v.visits > 0 ? 3 : 0)}%`, animationDelay: `${Number(v.hour) * 15}ms` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-fg-faint tabular">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </>
      )}
    </section>
  );
}
