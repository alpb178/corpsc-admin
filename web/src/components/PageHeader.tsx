import type { ReactNode } from 'react';
import { formatFullDate } from '@/lib/format';
import { RangePicker } from './RangePicker';
import type { Range } from '@/lib/types';

interface Props {
  title: string;
  subtitle?: string;
  range: Range;
  preset: string;
  comparedTo?: Range;
  /** Something next to the range picker: the dashboard's refresh control. */
  aside?: ReactNode;
}

export function PageHeader({ title, subtitle, range, preset, comparedTo, aside }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold text-fg">{title}</h1>
        <p className="mt-1 text-[13px] text-fg-muted">
          {subtitle ? `${subtitle} · ` : ''}
          {formatFullDate(range.from)} – {formatFullDate(range.to)}
          {comparedTo ? (
            <span className="text-fg-faint">
              {' '}· frente a {formatFullDate(comparedTo.from)} – {formatFullDate(comparedTo.to)}
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {aside}
        <RangePicker current={preset} />
      </div>
    </div>
  );
}
