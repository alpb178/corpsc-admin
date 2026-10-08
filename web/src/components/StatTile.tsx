import { AnimatedNumber } from './AnimatedNumber';
import { DeltaPill } from './DeltaPill';
import { Sparkline } from './Sparkline';
import { type Unit } from '@/lib/format';
import type { DayValue } from '@/lib/dashboard';
import type { Delta } from '@/lib/types';

interface Props {
  label: string;
  value: number | undefined;
  unit?: Unit;
  delta?: Delta;
  /** The main KPI is shown larger. */
  hero?: boolean;
  hint?: string;
  /** The metric's own days, drawn small next to the figure. */
  trend?: DayValue[];
}

/**
 * A KPI card, as in Tu Chamba's admin: the label, the figure in the brand
 * blue, and how it moved.
 *
 * It's a card and not a chart on purpose: a lone number reads at a glance.
 * What it carries besides the number is the direction —the change against
 * the previous period, and the shape of its days as a sparkline— so growth
 * or decline is on screen at all times without opening anything. No axes,
 * no legend: for those there are the charts below.
 */
export function StatTile({ label, value, unit = 'COUNT', delta, hero = false, hint, trend }: Props) {
  // A `null` change means there's no previous period to compare against —
  // not a 0 % change. Saying so ("sin base") invited reading it as a real
  // figure, so the pill is omitted instead; the card keeps its reserved row
  // so every tile in the grid stays the same height either way.
  const showDelta = delta && delta.change !== null;

  return (
    <div className="card flex h-full flex-col p-4 animate-fade-up motion-reduce:animate-none">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        {hint ? <span className="text-[11px] text-fg-faint">{hint}</span> : null}
      </div>

      <div className="mt-2 flex flex-1 items-end justify-between gap-3">
        <div className="min-w-0">
          <div className={`font-bold text-accent ${hero ? 'text-[40px] leading-none' : 'text-[28px] leading-tight'}`}>
            <AnimatedNumber value={value} unit={unit} />
          </div>
          <div className="mt-2 min-h-[18px]">{showDelta ? <DeltaPill delta={delta} unit={unit} /> : null}</div>
        </div>
        {trend && value !== undefined ? <Sparkline points={trend} unit={unit} /> : null}
      </div>
    </div>
  );
}
