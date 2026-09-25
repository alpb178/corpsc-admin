'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type SvgWorldMapType from 'react-svg-worldmap';

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
  const byCode = new Map(countries.map((c) => [c.code.toUpperCase(), c.value]));

  return (
    <div className="[&_svg]:h-auto [&_svg]:w-full" aria-hidden>
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
