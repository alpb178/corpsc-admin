'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ProjectSummary } from '@/lib/types';

interface Props {
  projects: ProjectSummary[];
  selected: string[];
  max: number;
}

/** Selector de sitios. Enlaces, para que la selección viva en la URL. */
export function ProjectPicker({ projects, selected, max }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const full = selected.length >= max;

  return (
    <div className="mb-4">
      <ul className="flex flex-wrap gap-1.5">
        {projects.map((project) => {
          const active = selected.includes(project.slug);
          const next = active
            ? selected.filter((s) => s !== project.slug)
            : [...selected, project.slug];

          const search = new URLSearchParams(params);
          search.set('sitios', next.join(','));

          // Sin hueco libre, los no seleccionados se desactivan en lugar de
          // fallar en silencio al pulsarlos.
          const disabled = !active && full;

          return (
            <li key={project.slug}>
              {disabled ? (
                <span
                  aria-disabled
                  className="inline-block cursor-not-allowed rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-faint opacity-50"
                >
                  {project.name}
                </span>
              ) : (
                <Link
                  href={`${pathname}?${search}`}
                  aria-pressed={active}
                  className={`inline-block rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft font-medium text-accent'
                      : 'border-line text-fg-muted hover:text-fg'
                  }`}
                >
                  {project.name}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {full ? (
        <p className="mt-2 text-[11px] text-fg-faint">
          Máximo {max} sitios a la vez: más líneas dejan de distinguirse entre sí.
        </p>
      ) : null}
    </div>
  );
}
