'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { PRESETS } from '@/lib/ranges';

/**
 * Los filtros van en una fila, encima de los gráficos, y son enlaces: así el
 * rango queda en la URL y una vista concreta se puede compartir o guardar.
 */
export function RangePicker({ current }: { current: string }) {
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <nav aria-label="Rango de fechas" className="flex items-center gap-1 rounded-full border border-line bg-card p-0.5">
      {PRESETS.map((preset) => {
        const next = new URLSearchParams(params);
        next.set('rango', preset.key);
        const active = preset.key === current;

        return (
          <Link
            key={preset.key}
            href={`${pathname}?${next}`}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              active ? 'bg-accent text-accent-contrast' : 'text-fg-muted hover:text-fg'
            }`}
          >
            {preset.label}
          </Link>
        );
      })}
    </nav>
  );
}
