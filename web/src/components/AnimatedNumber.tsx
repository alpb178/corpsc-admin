'use client';

import { useEffect, useRef } from 'react';
import { formatMetric, type Unit } from '@/lib/format';

interface Props {
  value: number | undefined;
  unit?: Unit;
  /** Milliseconds from the old figure to the new one. */
  duration?: number;
  className?: string;
}

/** True when the viewer asked the OS for less motion. Absent in tests: jsdom has no matchMedia. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A figure that counts up to its value when it appears, and rolls to the new
 * one when it changes (the dashboard refreshes itself every minute).
 *
 * The server renders the final figure, so the page never shows a 0 while the
 * script loads and search engines —there are none here— would read it right.
 * The tween then writes straight into the text node React rendered, frame by
 * frame, without a single setState: a re-render sixty times a second for
 * every tile would be waste, and the React Compiler lint would rightly
 * complain. Writing `nodeValue` (not `textContent`) keeps the very node React
 * owns, so React's next update still lands on it.
 *
 * With `prefers-reduced-motion` the figure just changes.
 */
export function AnimatedNumber({ value, unit = 'COUNT', duration = 700, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // The figure the viewer last saw fully, to roll from it rather than from 0.
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const node = ref.current?.firstChild as Text | null;
    if (!node || value === undefined) return;

    const from = shown.current ?? 0;
    shown.current = value;
    if (from === value || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      node.nodeValue = formatMetric(value, unit);
      return;
    }

    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out: fast at first, settling on the figure, so the eye reads the
      // final number for most of the time.
      const eased = 1 - Math.pow(1 - t, 3);
      node.nodeValue = formatMetric(from + (value - from) * eased, unit);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, unit, duration]);

  return (
    <span ref={ref} className={`tabular ${className ?? ''}`}>
      {formatMetric(value, unit)}
    </span>
  );
}
