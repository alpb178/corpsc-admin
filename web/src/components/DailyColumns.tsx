import { bucketed, type DayValue } from '@/lib/dashboard';
import { formatDay, formatMetric, formatShortDay, type Unit } from '@/lib/format';

interface Props {
  points: DayValue[];
  /** What a column counts, in words: "visitas". */
  noun: string;
  unit?: Unit;
  /** Tailwind height of the columns area. */
  height?: string;
}

/** How a column is named to the viewer: one day, or the days summed into it. */
function labelOf(b: DayValue): string {
  return b.to ? `${formatDay(b.date)} – ${formatDay(b.to)}` : formatDay(b.date);
}

/**
 * A column per day, as in Tu Chamba's admin: one ink, the peak written out so
 * the scale reads without hovering, and every other value in the tooltip of
 * its column. The columns grow from the baseline when they appear.
 *
 * A day with nothing keeps its slot as a grey stub: a gap at the weekend is
 * information, not missing data. On a long range several days share a
 * column, and the axis and the tooltip say so.
 *
 * HTML, not Recharts: the crosshair adds nothing to a single series, and the
 * card that holds this is itself a link, which a chart library's own event
 * handling would fight with.
 */
export function DailyColumns({ points, noun, unit = 'COUNT', height = 'h-28' }: Props) {
  const bars = bucketed(points, 31);
  const max = Math.max(...bars.map((b) => b.value ?? 0), 1);
  const hasData = bars.some((b) => (b.value ?? 0) > 0);
  const peak = hasData ? bars.findIndex((b) => b.value === max) : -1;
  // About seven labels, the last one always: 14 days reads every other day,
  // 28 every fourth.
  const every = Math.max(1, Math.ceil(bars.length / 7));
  const tight = bars.length > 20;

  if (bars.length === 0) return <p className="text-[13px] text-fg-faint">Sin datos en este periodo.</p>;

  return (
    <div>
      <div className={`flex ${height} items-end ${tight ? 'gap-[2px]' : 'gap-1'}`} role="list" aria-label={`${noun} por día`}>
        {bars.map((b, i) => {
          const value = b.value ?? 0;
          const figure = b.value === null ? 'sin datos' : `${formatMetric(value, unit)} ${noun}`;
          return (
            <div
              key={b.date}
              role="listitem"
              aria-label={`${labelOf(b)}: ${figure}`}
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
            >
              <div
                role="tooltip"
                className="pointer-events-none absolute -top-1 z-10 hidden -translate-y-full whitespace-nowrap rounded-[4px] bg-deep px-2 py-1 text-[11px] text-white group-hover:block"
              >
                {labelOf(b)} — {figure}
              </div>
              {i === peak ? (
                <span className="tabular mb-0.5 text-[11px] font-medium text-fg-muted">{formatMetric(max, unit)}</span>
              ) : null}
              {value > 0 ? (
                <div
                  className="w-full max-w-[24px] origin-bottom rounded-t-[3px] bg-accent animate-rise transition-colors group-hover:bg-accent-strong motion-reduce:animate-none"
                  style={{ height: `${(value / max) * 100}%`, minHeight: 3, animationDelay: `${i * 20}ms` }}
                />
              ) : (
                <div className="h-[3px] w-full max-w-[24px] rounded-[2px] bg-[var(--grid)]" />
              )}
            </div>
          );
        })}
      </div>
      <div className={`mt-1 flex border-t border-line pt-1 ${tight ? 'gap-[2px]' : 'gap-1'}`} aria-hidden>
        {bars.map((b, i) => (
          <span key={b.date} className="tabular flex-1 text-center text-[10px] text-fg-faint">
            {(bars.length - 1 - i) % every === 0 ? formatShortDay(b.date) : ''}
          </span>
        ))}
      </div>
      {!hasData ? <p className="mt-2 text-center text-[12px] text-fg-faint">Sin {noun} en este periodo.</p> : null}
    </div>
  );
}
