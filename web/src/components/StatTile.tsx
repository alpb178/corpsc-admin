import { formatChange, formatMetric, type Unit } from '@/lib/format';
import type { Delta } from '@/lib/types';

interface Props {
  label: string;
  value: number | undefined;
  unit?: Unit;
  delta?: Delta;
  /** The main KPI is shown larger. */
  hero?: boolean;
  hint?: string;
}

/**
 * A KPI. Figure, change and nothing else.
 *
 * It's a tile and not a single-bar chart on purpose: a lone number reads at a
 * glance, and a bar with nothing to compare against adds nothing.
 */
export function StatTile({ label, value, unit = 'COUNT', delta, hero = false, hint }: Props) {
  return (
    <div className="rounded-[6px] border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        {hint ? <span className="text-[11px] text-fg-faint">{hint}</span> : null}
      </div>

      <div className={`tabular mt-2 font-semibold text-fg ${hero ? 'text-[42px] leading-none' : 'text-[26px] leading-tight'}`}>
        {formatMetric(value, unit)}
      </div>

      {delta ? <DeltaLabel delta={delta} unit={unit} /> : null}
    </div>
  );
}

function DeltaLabel({ delta, unit }: { delta: Delta; unit: Unit }) {
  // Colour NEVER goes alone: an arrow and the previous period's text come
  // with it, so the information gets across just as well without telling
  // colours apart.
  const tone =
    delta.improved === null
      ? 'text-fg-subtle'
      : delta.improved
        ? 'text-[var(--positive)]'
        : 'text-[var(--negative)]';

  const arrow = delta.change === null || delta.change === 0 ? '→' : delta.change > 0 ? '↑' : '↓';

  return (
    <div className="mt-2 flex items-center gap-1.5 text-[12px]">
      <span className={`tabular font-medium ${tone}`}>
        {arrow} {formatChange(delta.change)}
      </span>
      <span className="text-fg-faint">
        vs {formatMetric(delta.previous, unit)}
      </span>
    </div>
  );
}
