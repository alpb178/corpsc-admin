'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, type ComponentProps } from 'react';
import { regions, type default as SvgWorldMapType } from 'react-svg-worldmap';

/* Client only: the library measures the window to size a responsive map, so
   its server markup never matches what the browser draws, and React would
   flag the hydration. A blank of the map's shape holds the room meanwhile. */
const SvgWorldMap = dynamic(() => import('react-svg-worldmap'), {
  ssr: false,
  loading: () => <div className="aspect-[2/1] w-full rounded-[6px] bg-elevated/60" />,
});
import { formatMetric, formatShare, labelDimension } from '@/lib/format';

export interface CountryValue {
  /** ISO 3166-1 alpha-2. */
  code: string;
  value: number;
}

/* The sequential palette of globals.css, as literals: the library writes the
   colour into SVG attributes, where a CSS variable doesn't resolve. */
const STEPS = ['#cfe0fa', '#9dc1f3', '#5b96ea', '#1668e3', '#0f52bd'];
const NONE = '#eef1f6';

type MapData = ComponentProps<typeof SvgWorldMapType<number>>['data'];
const SVG_NS = 'http://www.w3.org/2000/svg';

/** A country whose drawing is smaller than this, in the map's own units, is a speck. */
export const TINY = 6;

export interface Marker {
  code: string;
  cx: number;
  cy: number;
  value: number;
}

/**
 * The countries that have visits but no visible shape: Luxembourg, Malta,
 * Singapore… are on the map, a pixel wide, and the eye can't find them. Each
 * gets a dot at the centre of its box instead.
 */
export function markersFor(
  drawn: Array<{ code: string; box: { x: number; y: number; width: number; height: number } }>,
  values: Map<string, number>,
): Marker[] {
  return drawn.flatMap(({ code, box }) => {
    const value = values.get(code.toUpperCase());
    if (!value || Math.max(box.width, box.height) > TINY) return [];
    return [{ code: code.toUpperCase(), cx: box.x + box.width / 2, cy: box.y + box.height / 2, value }];
  });
}

/** Which step of the palette a share of the largest value gets. */
export function stepOf(share: number): string {
  if (share >= 0.8) return STEPS[4];
  if (share >= 0.5) return STEPS[3];
  if (share >= 0.25) return STEPS[2];
  if (share >= 0.1) return STEPS[1];
  return STEPS[0];
}

/**
 * Where the visits come from, on a map: darker is more, relative to the top
 * country. The figures live in the list beside it — the map is the picture,
 * the list is the data — and the tooltip names each country with its
 * visits and share. The map's data ships with the panel: nothing is fetched.
 */
export function WorldMap({ countries, noun = 'visitas' }: { countries: CountryValue[]; noun?: string }) {
  const max = Math.max(...countries.map((c) => c.value), 1);
  const total = countries.reduce((sum, c) => sum + c.value, 0);
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code.toUpperCase(), c.value])), [countries]);
  const root = useRef<HTMLDivElement>(null);

  // The dots for the specks. The library draws one <path> per region, in the
  // order of its `regions` export, inside a scaled <g>; the dots go into that
  // same <g>, so its coordinates are theirs. The map arrives after mount
  // (client only), so this watches the container until it does, and paints
  // again whenever the map redraws.
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const paint = () => {
      const paths = [...el.querySelectorAll<SVGPathElement>('svg path')];
      const stage = paths[0]?.parentElement;
      if (!stage || typeof paths[0].getBBox !== 'function') return;
      stage.querySelector('[data-markers]')?.remove();

      const markers = markersFor(
        paths.map((p, i) => ({ code: regions[i]?.code ?? '', box: p.getBBox() })),
        byCode,
      );
      if (markers.length === 0) return;

      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('data-markers', '');
      for (const m of markers) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', String(m.cx));
        dot.setAttribute('cy', String(m.cy));
        dot.setAttribute('r', '6');
        // Never the palest step: a speck's dot must stand out from the empty land around it.
        dot.setAttribute('fill', m.value / max >= 0.5 ? stepOf(m.value / max) : STEPS[2]);
        dot.setAttribute('stroke', '#ffffff');
        dot.setAttribute('stroke-width', '1.5');
        const title = document.createElementNS(SVG_NS, 'title');
        title.textContent = `${labelDimension(m.code)}: ${formatMetric(m.value)} ${noun} (${formatShare(m.value / total)})`;
        dot.appendChild(title);
        g.appendChild(dot);
      }
      stage.appendChild(g);
    };

    paint();
    const observer = new MutationObserver((records) => {
      // Our own <g> landing is a mutation too: ignore it, or this never settles.
      if (records.every((r) => [...r.addedNodes].every((n) => (n as Element).hasAttribute?.('data-markers')))) return;
      paint();
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [byCode, max, total, noun]);

  return (
    <div ref={root} className="[&_svg]:h-auto [&_svg]:w-full" aria-hidden>
      <SvgWorldMap
        size="responsive"
        backgroundColor="transparent"
        borderColor="#ffffff"
        strokeOpacity={1}
        color="#1668e3"
        // The library types the code as the union of the countries it draws;
        // one it doesn't know is simply not drawn.
        data={countries.map((c) => ({ country: c.code.toLowerCase(), value: c.value })) as MapData}
        styleFunction={({ countryCode, countryValue }) => ({
          fill: byCode.has(countryCode.toUpperCase()) ? stepOf(Number(countryValue ?? 0) / max) : NONE,
          stroke: '#ffffff',
          strokeWidth: 0.5,
          strokeOpacity: 1,
          cursor: byCode.has(countryCode.toUpperCase()) ? 'pointer' : 'default',
        })}
        tooltipTextFunction={({ countryCode, countryValue }) => {
          const value = Number(countryValue ?? byCode.get(countryCode.toUpperCase()) ?? 0);
          const name = labelDimension(countryCode.toUpperCase());
          return value > 0
            ? `${name}: ${formatMetric(value)} ${noun} (${formatShare(value / total)})`
            : `${name}: sin ${noun}`;
        }}
        tooltipBgColor="#06132e"
        tooltipTextColor="#ffffff"
      />
    </div>
  );
}
