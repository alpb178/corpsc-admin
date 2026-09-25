import { bucketed, type DayValue } from '@/lib/dashboard';
import { formatDay, formatMetric, type Unit } from '@/lib/format';

interface Props {
  points: DayValue[];
  unit?: Unit;
  className?: string;
}

/**
 * The shape of the period, next to a figure: a column per day (or per few
 * days on a long range), the latest one in full ink so the eye lands on
 * "where it is now".
 *
 * Decorative on purpose: the figure and its change carry the information,
 * this only shows whether it was climbing or falling to get there. No axes,
 * no labels — hovering a column names its day. Nothing is drawn while every
 * day is empty: an all-grey row says nothing.
 */
export function Sparkline({ points, unit = 'COUNT', className = '' }: Props) {
  const bars = bucketed(points, 30);
  if (!bars.some((b) => (b.value ?? 0) > 0)) return null;
  const max = Math.max(...bars.map((b) => b.value ?? 0), 1);

  return (
    <div aria-hidden className={`flex h-10 w-[104px] shrink-0 items-end gap-[2px] ${className}`}>
      {bars.map((b, i) => {
        const value = b.value ?? 0;
        const last = i === bars.length - 1;
        const when = b.to ? `${formatDay(b.date)} – ${formatDay(b.to)}` : formatDay(b.date);
        return (
          <span
            key={b.date}
            title={`${when}: ${b.value === null ? 'sin datos' : formatMetric(value, unit)}`}
            className={`flex-1 origin-bottom rounded-t-[2px] animate-rise motion-reduce:animate-none ${
              value > 0 ? (last ? 'bg-accent' : 'bg-accent/30') : 'bg-[var(--grid)]'
            }`}
            style={{
              height: `${value > 0 ? Math.max((value / max) * 100, 6) : 6}%`,
              animationDelay: `${i * 15}ms`,
            }}
          />
        );
      })}
    </div>
  );
}
