'use client';

import { useState } from 'react';
import { formatMetric, labelDimension } from '@/lib/format';
import type { DimensionSlice } from '@/lib/types';

/** Must match `ELEMENT_SEPARATOR` in api/src/ingestion/event-rollup.service.ts. */
const ELEMENT_SEPARATOR = ' | ';
const OTHER = '__other__';

interface ClickTarget {
  path: string;
  section: string;
  label: string;
  clicks: number;
}

function parseElement(slice: DimensionSlice): ClickTarget | null {
  if (slice.value === OTHER) return null;
  const [path, section, ...rest] = slice.value.split(ELEMENT_SEPARATOR);
  if (!path || !section || rest.length === 0) return null;
  return { path, section, label: rest.join(ELEMENT_SEPARATOR), clicks: slice.metrics.clicks ?? 0 };
}

/**
 * Which pages were visited and where people clicked on each.
 *
 * Two tables that read together: picking a page narrows the clicks to that
 * page, because "Contact" in the footer of the home page and in the footer of
 * a product page are different decisions for whoever organises the site.
 */
export function SiteNavigation({ pages, elements }: { pages: DimensionSlice[]; elements: DimensionSlice[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const pageRows = pages
    .filter((p) => (p.metrics.page_views ?? 0) > 0 || (p.metrics.clicks ?? 0) > 0)
    .sort((a, b) => (b.metrics.page_views ?? 0) - (a.metrics.page_views ?? 0));

  const targets = elements
    .map(parseElement)
    .filter((t): t is ClickTarget => t !== null && t.clicks > 0)
    .filter((t) => selected === null || t.path === selected)
    .sort((a, b) => b.clicks - a.clicks);

  const hasClicks = elements.some((e) => (e.metrics.clicks ?? 0) > 0);

  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <section className="rounded-[6px] border border-line bg-card">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold text-fg">Páginas visitadas</h2>
          <p className="mt-0.5 text-[12px] text-fg-faint">Elige una para ver dónde se hizo clic en ella.</p>
        </div>

        {pageRows.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-fg-faint">Sin páginas vistas en este periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-fg-faint">
                  <th scope="col" className="px-4 py-2 font-medium">Página</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Vistas</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Clics</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((page) => {
                  const isOther = page.value === OTHER;
                  const active = selected === page.value;
                  return (
                    <tr
                      key={page.value}
                      className={`border-b border-line last:border-0 ${active ? 'bg-accent-soft' : 'hover:bg-elevated'}`}
                    >
                      <th scope="row" className="max-w-0 px-4 py-2 text-left font-normal">
                        {isOther ? (
                          <span className="text-fg-faint">{labelDimension(page.value)}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSelected(active ? null : page.value)}
                            aria-pressed={active}
                            title={page.value}
                            className={`block w-full truncate text-left ${active ? 'font-medium text-accent' : 'text-fg hover:text-accent'}`}
                          >
                            {page.value}
                          </button>
                        )}
                      </th>
                      <td className="tabular px-4 py-2 text-right text-fg">{formatMetric(page.metrics.page_views)}</td>
                      <td className="tabular px-4 py-2 text-right text-fg-muted">{formatMetric(page.metrics.clicks)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-[6px] border border-line bg-card">
        <div className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-fg">Dónde hacen clic</h2>
            <p className="mt-0.5 truncate text-[12px] text-fg-faint">
              {selected === null ? 'En todas las páginas' : `En ${selected}`}
            </p>
          </div>
          {selected !== null ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 text-[12px] text-accent hover:text-accent-strong"
            >
              Ver todas
            </button>
          ) : null}
        </div>

        {targets.length === 0 ? (
          <p className="px-4 py-3 text-[13px] text-fg-faint">
            {hasClicks
              ? 'Ningún clic en esta página durante el periodo.'
              : 'Sin clics registrados. El sitio los envía desde que su beacon manda eventos de tipo click.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-fg-faint">
                  <th scope="col" className="px-4 py-2 font-medium">Elemento</th>
                  <th scope="col" className="px-4 py-2 font-medium">Sección</th>
                  {selected === null ? (
                    <th scope="col" className="px-4 py-2 font-medium">Página</th>
                  ) : null}
                  <th scope="col" className="px-4 py-2 text-right font-medium">Clics</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t) => (
                  <tr key={`${t.path}${t.section}${t.label}`} className="border-b border-line last:border-0 hover:bg-elevated">
                    <th scope="row" className="max-w-[16rem] truncate px-4 py-2 text-left font-medium text-fg" title={t.label}>
                      {t.label}
                    </th>
                    <td className="px-4 py-2 text-fg-muted">{t.section}</td>
                    {selected === null ? (
                      <td className="max-w-[12rem] truncate px-4 py-2 text-fg-faint" title={t.path}>
                        {t.path}
                      </td>
                    ) : null}
                    <td className="tabular px-4 py-2 text-right text-fg">{formatMetric(t.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
