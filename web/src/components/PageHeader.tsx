import { formatFullDate } from '@/lib/format';
import { RangePicker } from './RangePicker';
import type { Range } from '@/lib/types';

interface Props {
  title: string;
  subtitle?: string;
  range: Range;
  preset: string;
  comparedTo?: Range;
}

export function PageHeader({ title, subtitle, range, preset, comparedTo }: Props) {
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
      <RangePicker current={preset} />
    </div>
  );
}
