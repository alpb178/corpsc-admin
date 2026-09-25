import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankIcon } from './RankIcon';

const svgClass = (ui: React.ReactElement) => render(ui).container.querySelector('svg')?.getAttribute('class') ?? null;

describe('RankIcon', () => {
  it('turns a country code into its flag, and anything else into a globe', () => {
    expect(render(<RankIcon kind="country" value="BO" />).container.textContent).toBe('🇧🇴');
    expect(svgClass(<RankIcon kind="country" value="__unknown__" />)).toContain('lucide-globe');
  });

  it('shows a letter tile for a source domain and a link for direct traffic', () => {
    expect(render(<RankIcon kind="source" value="www.google.com" />).container.textContent).toBe('g');
    expect(svgClass(<RankIcon kind="source" value="__direct__" />)).toContain('lucide-globe');
  });

  it('picks the device and channel pictures, with a globe for the unknown', () => {
    expect(svgClass(<RankIcon kind="device" value="mobile" />)).toContain('lucide-smartphone');
    expect(svgClass(<RankIcon kind="device" value="__unknown__" />)).toContain('lucide-globe');
    expect(svgClass(<RankIcon kind="channel" value="Organic Search" />)).toContain('lucide-search');
    expect(svgClass(<RankIcon kind="channel" value="Direct" />)).toContain('lucide-link');
  });
});
