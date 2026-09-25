'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';

/** The beacon sites are rolled up seconds after each visit: a minute is fresh enough. */
export const REFRESH_MS = 60_000;

/**
 * Keeps the page's figures current without anyone reloading it.
 *
 * `router.refresh()` re-runs the server components with the same URL, so the
 * range stays and the client state —the live panel, the menu— survives; the
 * figures roll to their new value. It waits while the tab is hidden and
 * catches up as soon as it is seen again. The button does the same by hand,
 * and its icon turns while the refresh is in flight.
 *
 * "hace N s" is only rendered after mount: the server's clock and the
 * browser's would not agree on it, and React would flag the mismatch.
 */
export function AutoRefresh({ everyMs = REFRESH_MS }: { everyMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // When the figures were last refreshed, and a clock to say how long ago.
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      startTransition(() => router.refresh());
      setRefreshedAt(Date.now());
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = setTimeout(refresh, everyMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
      else clearTimeout(timer);
    };

    const clock = setInterval(() => setNow(Date.now()), 1_000);
    // The first tick, without waiting a second: the caption reads "hace 0 s".
    const first = setTimeout(() => {
      setRefreshedAt(Date.now());
      setNow(Date.now());
    }, 0);
    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timer);
      clearTimeout(first);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [router, everyMs]);

  const seconds = refreshedAt !== null && now !== null ? Math.max(0, Math.round((now - refreshedAt) / 1000)) : null;

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => router.refresh());
        setRefreshedAt(Date.now());
      }}
      disabled={pending}
      title="Actualizar ahora"
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-accent hover:text-fg disabled:opacity-70"
    >
      <RefreshCw size={13} aria-hidden className={pending ? 'animate-spin motion-reduce:animate-none' : ''} />
      <span role="status">
        {pending ? 'Actualizando…' : seconds === null ? 'Se actualiza cada minuto' : `Actualizado hace ${seconds} s`}
      </span>
    </button>
  );
}
