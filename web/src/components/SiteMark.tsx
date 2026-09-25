import Image from 'next/image';
import { initialsOf } from '@/lib/navigation';

interface Props {
  name: string;
  logo?: string;
  /** Pixel size of the square. */
  size?: number;
}

/**
 * A site's mark: its logo if the panel ships one, its initials otherwise, so
 * a project added to the hub before its icon still gets a face of its own.
 * Decorative: the name is always written next to it.
 */
export function SiteMark({ name, logo, size = 36 }: Props) {
  if (logo) {
    return (
      <Image
        src={logo}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-[8px] object-cover ring-1 ring-line"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[8px] bg-elevated text-[12px] font-bold text-fg-muted"
      style={{ width: size, height: size }}
    >
      {initialsOf(name)}
    </span>
  );
}
