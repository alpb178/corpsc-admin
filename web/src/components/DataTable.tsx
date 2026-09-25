'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type { ActionResult, DeleteRowAction, RecordTable } from '@/lib/types';

export const PAGE_SIZE = 10;

export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
  className?: string;
}

export interface Row {
  id: string;
  cells: Record<string, ReactNode>;
  /** What a deletion names to the API. Without it the row can't be deleted. */
  deleteKey?: string;
  /** How the confirmation names the row. */
  deleteLabel?: string;
  /** The row's site, when the table mixes several. */
  slug?: string;
  className?: string;
}

/** Everything a deletion needs besides the row: the action, the table and the period on screen. */
export interface Deletion {
  action: DeleteRowAction;
  table: RecordTable;
  slug?: string;
  from: string;
  to: string;
}

interface Props {
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Row[];
  emptyText: ReactNode;
  /** Present only for someone allowed to delete: the column doesn't exist otherwise. */
  deletion?: Deletion;
  pageSize?: number;
  /** Something in the header, next to the title. */
  aside?: ReactNode;
  /** Without the card: for a table that lives inside another card. */
  bare?: boolean;
}

/**
 * The panel's one table: ten rows a page, and a way to delete a row for
 * whoever may.
 *
 * Deleting asks once, in the row itself, and says what happened in the
 * footer: the row's events go for the period on screen and the rest is
 * recomputed, so the figure the person sees next is the right one. The
 * page never jumps: if the rows shrink below the page shown, the page is
 * the last one that still has rows.
 */
export function DataTable({ title, subtitle, columns, rows, emptyText, deletion, pageSize = PAGE_SIZE, aside, bare = false }: Props) {
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * pageSize, current * pageSize);
  const canDelete = deletion !== undefined;

  const remove = (row: Row) => {
    const slug = row.slug ?? deletion?.slug;
    if (!deletion || !slug || !row.deleteKey) return;
    const { action, table, from, to } = deletion;
    const key = row.deleteKey;
    startTransition(async () => {
      const result = await action({ slug, table, key, from, to });
      setNotice(result);
      setConfirming(null);
    });
  };

  const header = (
    <div className={`flex flex-wrap items-baseline justify-between gap-2 ${bare ? 'mb-2' : 'border-b border-line px-4 py-3'}`}>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-[12px] text-fg-faint">{subtitle}</p> : null}
      </div>
      {aside}
    </div>
  );

  const body =
    rows.length === 0 ? (
      <p className={`text-[13px] text-fg-faint ${bare ? '' : 'px-4 py-3'}`}>{emptyText}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-fg-faint">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`py-2 font-medium ${bare ? 'px-2 first:pl-0' : 'px-4'} ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}
                >
                  {c.label}
                </th>
              ))}
              {canDelete ? (
                <th scope="col" className="w-10 py-2">
                  <span className="sr-only">Borrar</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className={`border-b border-line last:border-0 hover:bg-elevated ${row.className ?? ''}`}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`py-2 ${bare ? 'px-2 first:pl-0' : 'px-4'} ${c.align === 'right' ? 'tabular text-right' : ''} ${c.className ?? ''}`}
                  >
                    {row.cells[c.key]}
                  </td>
                ))}
                {canDelete ? (
                  <td className={`py-1 text-right ${bare ? 'pl-2' : 'px-3'}`}>
                    {row.deleteKey === undefined ? null : confirming === row.id ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px]">
                        <span className="text-fg-muted">¿Borrar?</span>
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          disabled={pending}
                          className="rounded-full bg-negative px-2 py-0.5 font-semibold text-white disabled:opacity-60"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          disabled={pending}
                          className="rounded-full border border-line px-2 py-0.5 text-fg-muted hover:text-fg"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(row.id)}
                        disabled={pending}
                        title="Borrar"
                        aria-label={`Borrar ${row.deleteLabel ?? row.deleteKey}`}
                        className="rounded-[5px] p-1.5 text-fg-faint transition-colors hover:bg-negative-soft hover:text-negative disabled:opacity-60"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const footer =
    rows.length > pageSize || notice || (canDelete && rows.length > 0) ? (
      <div className={`flex flex-wrap items-center justify-between gap-2 ${bare ? 'mt-2' : 'border-t border-line px-4 py-2'}`}>
        <div className="min-w-0 text-[12px]">
          {notice?.error ? (
            <p role="alert" className="text-negative">{notice.error}</p>
          ) : notice?.ok ? (
            <p role="status" className="text-positive">{notice.ok}</p>
          ) : canDelete && rows.length > 0 ? (
            <p className="text-fg-faint">Borrar quita los eventos de esa fila en el periodo elegido y recalcula el resto.</p>
          ) : null}
        </div>
        {rows.length > pageSize ? (
          <nav aria-label={`Páginas de ${title}`} className="flex items-center gap-1 text-[12px] text-fg-muted">
            <span className="tabular">
              {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, rows.length)} de {rows.length}
            </span>
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 1}
              aria-label="Página anterior"
              className="rounded-[5px] p-1 hover:bg-elevated disabled:opacity-40"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current === pages}
              aria-label="Página siguiente"
              className="rounded-[5px] p-1 hover:bg-elevated disabled:opacity-40"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </nav>
        ) : null}
      </div>
    ) : null;

  if (bare) {
    return (
      <div>
        {header}
        {body}
        {footer}
      </div>
    );
  }

  return (
    <section className="card" aria-busy={pending}>
      {header}
      {body}
      {footer}
    </section>
  );
}
