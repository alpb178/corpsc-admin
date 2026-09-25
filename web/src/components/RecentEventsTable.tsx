'use client';

import { DataTable, type Deletion } from './DataTable';
import { formatAgo, formatClock, labelDimension, labelEventType } from '@/lib/format';
import type { RecentEvent } from '@/lib/types';

interface Props {
  events: RecentEvent[];
  /** The clock "hace N s" is read against. Without one the list isn't live, and each event shows its hour. */
  now?: number;
  /** Name each event's site: the group view mixes them. */
  showProject: boolean;
  /** For whoever may delete one. The site comes from each event. */
  deletion?: Omit<Deletion, 'table' | 'slug'>;
  bare?: boolean;
}

/** The latest things people did on the sites, newest first. */
export function RecentEventsTable({ events, now, showProject, deletion, bare = false }: Props) {
  const rows = events.map((event) => ({
    id: event.id,
    slug: event.project.slug,
    deleteKey: event.id,
    deleteLabel: `el evento de ${event.project.name} en ${event.path}`,
    cells: {
      when: (
        <time dateTime={event.at} className="tabular whitespace-nowrap text-fg-faint">
          {now === undefined ? formatClock(event.at) : formatAgo(event.at, now)}
        </time>
      ),
      project: <span className="whitespace-nowrap font-medium text-fg">{event.project.name}</span>,
      what: (
        <span className="text-fg-muted">
          {labelEventType(event.type)} <span className="text-fg">{event.path}</span>
          {event.detail ? <span className="text-fg-muted"> · {event.detail}</span> : null}
        </span>
      ),
      where: (
        <span className="whitespace-nowrap text-fg-faint">
          {[
            event.city ?? (event.country ? labelDimension(event.country) : null),
            event.source,
            event.device ? labelDimension(event.device) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      ),
    },
  }));

  return (
    <DataTable
      title="Últimos eventos"
      columns={[
        { key: 'when', label: 'Cuándo' },
        ...(showProject ? [{ key: 'project', label: 'Sitio' }] : []),
        { key: 'what', label: 'Qué' },
        { key: 'where', label: 'Dónde', align: 'right' as const },
      ]}
      rows={rows}
      emptyText="Ningún evento todavía."
      deletion={deletion ? { ...deletion, table: 'recent' } : undefined}
      bare={bare}
    />
  );
}
