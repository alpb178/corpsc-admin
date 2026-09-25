import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatChange, formatMetric, type Unit } from '@/lib/format';
import type { Delta } from '@/lib/types';

interface Props {
  delta: Delta;
  unit?: Unit;
  /** Just the arrow and the percentage, for a row of small figures. */
  compact?: boolean;
}

/**
 * The change against the previous period, as a tinted pill.
 *
 * Colour NEVER goes alone: the arrow says which way and the text says how
 * much, so it reads the same without telling green from red. "Improved" is
 * not "went up": fewer cancellations is green with a down arrow.
 */
export function DeltaPill({ delta, unit = 'COUNT', compact = false }: Props) {
  // A change that rounds to 0 % is no change: 4.293 against 4.291 must not
  // wear a red arrow next to a "0 %".
  const flat = delta.change === null || delta.improved === null || Math.abs(delta.change) < 0.0005;
  const tone = flat
    ? 'bg-elevated text-fg-subtle'
    : delta.improved
      ? 'bg-positive-soft text-positive'
      : 'bg-negative-soft text-negative';

  const Arrow = flat ? Minus : delta.change! > 0 ? ArrowUpRight : ArrowDownRight;
  const direction = flat ? 'sin cambio' : delta.change! > 0 ? 'sube' : 'baja';

  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
      <span
        className={`tabular inline-flex items-center gap-0.5 rounded-full font-semibold ${tone} ${
          compact ? 'px-1.5 py-px' : 'px-2 py-0.5'
        }`}
      >
        <Arrow size={compact ? 12 : 14} aria-hidden strokeWidth={2.5} />
        <span className="sr-only">{direction} </span>
        {formatChange(delta.change)}
      </span>
      {!compact ? <span className="tabular text-fg-faint">vs {formatMetric(delta.previous, unit)}</span> : null}
    </span>
  );
}
