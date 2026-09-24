'use client';

import { useEffect, useState } from 'react';
import { formatAgo, formatMetric, labelDimension, labelEventType } from '@/lib/format';
import type { RealtimeSnapshot } from '@/lib/types';

/** Often enough to feel live, rarely enough not to load anything. */
export const POLL_MS = 20_000;

interface Props {
  /** The first snapshot, fetched on the server so the widget never opens empty. */
  initial: RealtimeSnapshot | null;
  /** One site; the whole group if omitted. */
  project?: string;
}

/**
 * Who is on the sites right now, and the latest things they did.
 *
 * It polls the panel's `/api/realtime` instead of keeping a socket open: the
 * hub's numbers are minutes, not milliseconds, and a request every 20 s is
 * nothing. While the tab is hidden it stops, and it catches up as soon as it
 * becomes visible again. A failed poll keeps the last good snapshot and says
 * so, rather than blanking the widget.
 */
export function RealtimePanel({ initial, project }: Props) {
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot | null>(initial);
  const [stale, setStale] = useState(initial === null);
  // Re-rendered with each poll, so "hace 12 s" moves on too.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function poll() {
      try {
        const query = project ? `?project=${encodeURIComponent(project)}` : '';
        const response = await fetch(`/api/realtime${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as RealtimeSnapshot;
        if (cancelled) return;
        setSnapshot(next);
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      } finally {
        if (!cancelled) {
          setNow(Date.now());
          schedule();
        }
      }
    }

    function schedule() {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = setTimeout(poll, POLL_MS);
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') void poll();
      else clearTimeout(timer);
    }

    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [project]);

  return (
    <section aria-label="Tiempo real" className="rounded-[6px] border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          {/* The dot says "live"; the word says it too, so it isn't colour alone. */}
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--positive)] opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--positive)]" />
          </span>
          En vivo
        </h2>
        {stale ? (
          <p role="status" className="text-[12px] text-fg-faint">
            Sin conexión con el hub: se muestran los últimos datos recibidos.
          </p>
        ) : null}
      </div>

      {!snapshot ? (
        <p className="px-4 py-3 text-[13px] text-fg-faint">Todavía no hay datos en tiempo real.</p>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="border-b border-line p-4 lg:border-b-0 lg:border-r">
            <p className="text-[13px] font-medium text-fg-muted">Usuarios activos</p>
            <p className="tabular mt-1 text-[42px] font-semibold leading-none text-fg">
              {formatMetric(snapshot.activeVisitors)}
            </p>
            <p className="mt-1 text-[12px] text-fg-faint">en los últimos {snapshot.minutes} min</p>

            {!project && snapshot.byProject.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-1.5">
                {snapshot.byProject.map((p) => (
                  <li key={p.slug} className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate text-fg-muted">{p.name}</span>
                    <span className="tabular font-medium text-fg">{formatMetric(p.activeVisitors)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="min-w-0 p-4">
            <p className="text-[13px] font-medium text-fg-muted">Últimos eventos</p>
            {snapshot.recent.length === 0 ? (
              <p className="mt-2 text-[13px] text-fg-faint">Ningún evento todavía.</p>
            ) : (
              <ol className="mt-2 flex flex-col divide-y divide-[var(--line)]">
                {snapshot.recent.slice(0, 8).map((event, i) => (
                  <li key={`${event.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-[12px]">
                    <time dateTime={event.at} className="tabular w-[72px] shrink-0 text-fg-faint">
                      {formatAgo(event.at, now)}
                    </time>
                    {!project ? <span className="font-medium text-fg">{event.project.name}</span> : null}
                    <span className="text-fg-muted">
                      {labelEventType(event.type)} <span className="text-fg">{event.path}</span>
                      {event.detail ? <span className="text-fg-muted"> · {event.detail}</span> : null}
                    </span>
                    <span className="ml-auto text-fg-faint">
                      {[
                        event.city ?? (event.country ? labelDimension(event.country) : null),
                        event.source,
                        event.device ? labelDimension(event.device) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
