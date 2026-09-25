'use client';

import { useState } from 'react';
import { DataTable, type Deletion } from './DataTable';
import { formatMetric, labelDimension } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

/** Must match `ELEMENT_SEPARATOR` in api/src/ingestion/event-rollup.service.ts. */
const ELEMENT_SEPARATOR = ' | ';
const OTHER = '__other__';

interface ClickTarget {
  /** The row as the hub stores it. */
  key: string;
  path: string;
  section: string;
  label: string;
  clicks: number;
}

function parseElement(slice: DimensionSlice): ClickTarget | null {
  if (slice.value === OTHER) return null;
  const [path, section, ...rest] = slice.value.split(ELEMENT_SEPARATOR);
  if (!path || !section || rest.length === 0) return null;
  return { key: slice.value, path, section, label: rest.join(ELEMENT_SEPARATOR), clicks: slice.metrics.clicks ?? 0 };
}

interface Props {
  pages: DimensionSlice[];
  elements: DimensionSlice[];
  /** For whoever may delete a page's views or an element's clicks. */
  deletion?: Omit<Deletion, 'table'>;
}

/**
 * Which pages were visited and where people clicked on each.
 *
 * Two tables that read together: picking a page narrows the clicks to that
 * page, because "Contact" in the footer of the home page and in the footer of
 * a product page are different decisions for whoever organises the site.
 */
export function SiteNavigation({ pages, elements, deletion }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const pageRows = pages
    .filter((p) => (p.metrics.page_views ?? 0) > 0 || (p.metrics.clicks ?? 0) > 0)
    .sort((a, b) => (b.metrics.page_views ?? 0) - (a.metrics.page_views ?? 0))
    .map((page) => {
      const isOther = page.value === OTHER;
      const active = selected === page.value;
      return {
        id: page.value,
        className: active ? 'bg-accent-soft hover:bg-accent-soft' : '',
        ...(isOther ? {} : { deleteKey: page.value, deleteLabel: `la página ${page.value}` }),
        cells: {
          page: isOther ? (
            <span className="text-fg-faint">{labelDimension(page.value)}</span>
          ) : (
            <button
              type="button"
              onClick={() => setSelected(active ? null : page.value)}
              aria-pressed={active}
              title={page.value}
              className={`block max-w-[22rem] truncate text-left ${active ? 'font-medium text-accent' : 'text-fg hover:text-accent'}`}
            >
              {page.value}
            </button>
          ),
          views: <span className="text-fg">{formatMetric(page.metrics.page_views)}</span>,
          clicks: <span className="text-fg-muted">{formatMetric(page.metrics.clicks)}</span>,
        },
      };
    });

  const targets = elements
    .map(parseElement)
    .filter((t): t is ClickTarget => t !== null && t.clicks > 0)
    .filter((t) => selected === null || t.path === selected)
    .sort((a, b) => b.clicks - a.clicks)
    .map((t) => ({
      id: t.key,
      deleteKey: t.key,
      deleteLabel: `los clics en ${t.label} de ${t.path}`,
      cells: {
        element: (
          <span className="block max-w-[16rem] truncate font-medium text-fg" title={t.label}>
            {t.label}
          </span>
        ),
        section: <span className="text-fg-muted">{t.section}</span>,
        page: (
          <span className="block max-w-[12rem] truncate text-fg-faint" title={t.path}>
            {t.path}
          </span>
        ),
        clicks: <span className="text-fg">{formatMetric(t.clicks)}</span>,
      },
    }));

  const hasClicks = elements.some((e) => (e.metrics.clicks ?? 0) > 0);

  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <DataTable
        title="Páginas visitadas"
        subtitle="Elige una para ver dónde se hizo clic en ella."
        columns={[
          { key: 'page', label: 'Página' },
          { key: 'views', label: 'Vistas', align: 'right' },
          { key: 'clicks', label: 'Clics', align: 'right' },
        ]}
        rows={pageRows}
        emptyText="Sin páginas vistas en este periodo."
        deletion={deletion ? { ...deletion, table: 'page' } : undefined}
      />

      <DataTable
        title="Dónde hacen clic"
        subtitle={selected === null ? 'En todas las páginas' : `En ${selected}`}
        aside={
          selected !== null ? (
            <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-[12px] text-accent hover:text-accent-strong">
              Ver todas
            </button>
          ) : undefined
        }
        columns={[
          { key: 'element', label: 'Elemento' },
          { key: 'section', label: 'Sección' },
          ...(selected === null ? [{ key: 'page', label: 'Página' }] : []),
          { key: 'clicks', label: 'Clics', align: 'right' as const },
        ]}
        rows={targets}
        emptyText={
          hasClicks
            ? 'Ningún clic en esta página durante el periodo.'
            : 'Sin clics registrados. El sitio los envía desde que su beacon manda eventos de tipo click.'
        }
        deletion={deletion ? { ...deletion, table: 'element' } : undefined}
      />
    </div>
  );
}
