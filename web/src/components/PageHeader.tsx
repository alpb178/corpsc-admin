import type { ReactNode } from 'react';
import { formatFullDate } from '@/lib/format';
import { RangePicker } from './RangePicker';
import { SiteMark } from './SiteMark';
import type { Range } from '@/lib/types';

interface Props {
  title: string;
  subtitle?: string;
  range: Range;
  preset: string;
  comparedTo?: Range;
  /** True for a header about one project: shows its mark (logo, or initials if it has none) next to the title. */
  siteHeader?: boolean;
  logo?: string;
  /** Something next to the range picker: the dashboard's refresh control. */
  aside?: ReactNode;
}

export function PageHeader({ title, subtitle, range, preset, comparedTo, siteHeader, logo, aside }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        {siteHeader ? <SiteMark name={title} logo={logo} size={36} /> : null}
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
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {aside}
        <RangePicker current={preset} />
      </div>
    </div>
  );
}
