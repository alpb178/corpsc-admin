import { Monitor, Smartphone, Tablet, Tv, CircleHelp, type LucideIcon } from 'lucide-react';
import { formatMetric, formatShare, labelDimension } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

const DEVICES: Record<string, LucideIcon> = {
  mobile: Smartphone,
  desktop: Monitor,
  tablet: Tablet,
  smart_tv: Tv,
};

/** One hue, darker for the larger share; the unknown is grey. */
const TONES = ['var(--seq-4)', 'var(--seq-3)', 'var(--seq-2)', 'var(--seq-1)'];

interface Props {
  slices: DimensionSlice[];
  title?: string;
  emptyHint?: string;
}

/**
 * Where people read the site from: a bar split by device and a tile per
 * device with its picture, share and count. A picture per device reads at a
 * glance where a list of words needs reading; the words stay next to it, so
 * nothing depends on knowing the icons.
 */
export function DeviceSplit({ slices, title = 'Dispositivos', emptyHint }: Props) {
  const rows = slices
    .map((s) => ({ value: s.value, visits: s.metrics.visits ?? 0 }))
    .filter((r) => r.visits > 0)
    .sort((a, b) => b.visits - a.visits);
  const total = rows.reduce((sum, r) => sum + r.visits, 0);

  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {total > 0 ? <p className="tabular text-[12px] text-fg-faint">{formatMetric(total)} en total</p> : null}
      </div>

      {total === 0 ? (
        <p className="mt-3 text-[13px] text-fg-faint">{emptyHint ?? 'Sin datos en este periodo.'}</p>
      ) : (
        <>
          <div className="mt-3 flex h-[10px] gap-[2px] overflow-hidden rounded-[5px]" aria-hidden>
            {rows.map((r, i) => (
              <div
                key={r.value}
                className="origin-left animate-grow motion-reduce:animate-none"
                style={{
                  width: `${(r.visits / total) * 100}%`,
                  background: r.value.startsWith('__') ? 'var(--line-strong)' : TONES[Math.min(i, TONES.length - 1)],
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>

          <ul className="mt-3 grid grid-cols-2 gap-2">
            {rows.map((r, i) => {
              const Icon = DEVICES[r.value] ?? CircleHelp;
              const leading = i === 0;
              return (
                <li
                  key={r.value}
                  className={`flex items-center gap-2.5 rounded-[8px] px-3 py-2 ${leading ? 'bg-accent-soft' : 'bg-elevated/60'}`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${
                      leading ? 'bg-accent text-accent-contrast' : 'bg-card text-fg-subtle ring-1 ring-line'
                    }`}
                  >
                    <Icon size={18} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] text-fg-muted">{labelDimension(r.value)}</p>
                    <p className="tabular flex items-baseline gap-1.5 text-[15px] font-semibold text-fg">
                      {formatShare(r.visits / total)}
                      <span className="text-[11px] font-normal text-fg-faint">{formatMetric(r.visits)}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
