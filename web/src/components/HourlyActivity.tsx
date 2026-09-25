import { Moon, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { formatMetric, formatShare } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

/** The day in four parts, so "when do they come" has a one-word answer. */
const BANDS: Array<{ label: string; from: number; to: number; Icon: LucideIcon }> = [
  { label: 'Madrugada', from: 0, to: 5, Icon: Moon },
  { label: 'Mañana', from: 6, to: 11, Icon: Sunrise },
  { label: 'Tarde', from: 12, to: 17, Icon: Sun },
  { label: 'Noche', from: 18, to: 23, Icon: Sunset },
];

/**
 * Visits by hour of the day, in the project's time zone.
 *
 * Twenty-four columns in one ink with the peak written out, each hour in a
 * tooltip, and the day split into four bands with their share, so the card
 * answers "when do they come" without reading the axis. An hour with no
 * visits keeps its slot as a stub — a gap at 04:00 is information, not
 * missing data.
 */
export function HourlyActivity({ slices, timezone }: { slices: DimensionSlice[]; timezone: string }) {
  const byHour = new Map(slices.map((s) => [s.value, s.metrics.visits ?? 0]));
  const values = HOURS.map((hour) => ({ hour, visits: byHour.get(hour) ?? 0 }));
  const total = values.reduce((sum, v) => sum + v.visits, 0);
  const max = Math.max(...values.map((v) => v.visits), 1);
  const peak = values.reduce((best, v) => (v.visits > best.visits ? v : best), values[0]);
  const bands = BANDS.map((b) => ({
    ...b,
    visits: values.slice(b.from, b.to + 1).reduce((sum, v) => sum + v.visits, 0),
  }));
  const busiest = bands.reduce((best, b) => (b.visits > best.visits ? b : best), bands[0]);

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-fg">Horario de visitas</h3>
        <p className="text-[12px] text-fg-faint">{timezone}</p>
      </div>

      {total === 0 ? (
        <p className="mt-3 text-[13px] text-fg-faint">Sin datos en este periodo.</p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-fg-muted">
            Hora con más visitas: <strong className="tabular font-semibold text-fg">{peak.hour}:00</strong> ·{' '}
            {formatMetric(peak.visits)}. La franja más activa es la <strong className="font-semibold text-fg">{busiest.label.toLowerCase()}</strong>.
          </p>

          <div className="mt-4 flex h-32 items-end gap-[3px]" role="list" aria-label="Visitas por hora">
            {values.map((v, i) => (
              <div
                key={v.hour}
                role="listitem"
                aria-label={`${v.hour}:00 — ${formatMetric(v.visits)} visitas`}
                className={`group relative flex h-full flex-1 flex-col items-center justify-end rounded-[3px] ${
                  // Alternate bands take a faint background, so the day's parts read on the columns too.
                  Math.floor(i / 6) % 2 === 1 ? 'bg-elevated/70' : ''
                }`}
              >
                <div
                  role="tooltip"
                  className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full whitespace-nowrap rounded-[4px] bg-deep px-2 py-1 text-[11px] text-white group-hover:block"
                >
                  {v.hour}:00–{v.hour}:59 — {formatMetric(v.visits)} visitas
                </div>
                {v.hour === peak.hour ? (
                  <span className="tabular mb-0.5 text-[11px] font-medium text-fg-muted">{formatMetric(peak.visits)}</span>
                ) : null}
                {v.visits > 0 ? (
                  <div
                    className="w-full max-w-[22px] origin-bottom rounded-t-[3px] bg-accent animate-rise transition-colors group-hover:bg-accent-strong motion-reduce:animate-none"
                    style={{ height: `${(v.visits / max) * 100}%`, minHeight: 3, animationDelay: `${i * 15}ms` }}
                  />
                ) : (
                  <div className="h-[3px] w-full max-w-[22px] rounded-[2px] bg-[var(--grid)]" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[3px] border-t border-line pt-1" aria-hidden>
            {values.map((v, i) => (
              <span key={v.hour} className="tabular flex-1 text-center text-[10px] text-fg-faint">
                {i % 3 === 0 ? `${i}h` : ''}
              </span>
            ))}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {bands.map((b) => (
              <div
                key={b.label}
                className={`flex items-center gap-2.5 rounded-[8px] px-3 py-2 ${
                  b === busiest ? 'bg-accent-soft' : 'bg-elevated/60'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] ${
                    b === busiest ? 'bg-accent text-accent-contrast' : 'bg-card text-fg-subtle ring-1 ring-line'
                  }`}
                >
                  <b.Icon size={16} aria-hidden />
                </span>
                <div className="min-w-0">
                  <dt className="text-[11px] text-fg-faint">
                    {b.label} · {String(b.from).padStart(2, '0')}–{String(b.to + 1).padStart(2, '0')} h
                  </dt>
                  <dd className="tabular flex items-baseline gap-1.5 text-[13px] font-semibold text-fg">
                    {formatShare(b.visits / total)}
                    <span className="text-[11px] font-normal text-fg-faint">{formatMetric(b.visits)}</span>
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
