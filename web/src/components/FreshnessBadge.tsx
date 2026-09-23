import type { Freshness } from '@/lib/types';

const STATE: Record<Freshness, { text: string; tone: string; icon: string }> = {
  OK: { text: 'al día', tone: 'text-[var(--positive)]', icon: '●' },
  LATE: { text: 'con retraso', tone: 'text-fg-subtle', icon: '◐' },
  STALE: { text: 'sin datos recientes', tone: 'text-[var(--negative)]', icon: '▲' },
  NEVER: { text: 'nunca ha enviado', tone: 'text-fg-faint', icon: '○' },
};

/** Colour never goes alone: an icon and a word always come with it. */
export function FreshnessBadge({ freshness, hoursSince }: { freshness: Freshness; hoursSince: number | null }) {
  const state = STATE[freshness];

  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span aria-hidden className={state.tone}>{state.icon}</span>
      <span className={state.tone}>{state.text}</span>
      {hoursSince !== null && freshness !== 'OK' ? (
        <span className="tabular text-fg-faint">({hoursSince} h)</span>
      ) : null}
    </span>
  );
}
