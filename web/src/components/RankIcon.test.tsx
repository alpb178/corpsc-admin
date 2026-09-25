import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankIcon } from './RankIcon';

const svgClass = (ui: React.ReactElement) => render(ui).container.querySelector('svg')?.getAttribute('class') ?? null;

describe('RankIcon', () => {
  it('turns a country code into its flag, and anything else into a globe', () => {
    expect(render(<RankIcon kind="country" value="BO" />).container.textContent).toBe('🇧🇴');
    expect(svgClass(<RankIcon kind="country" value="__unknown__" />)).toContain('lucide-globe');
  });

  it('shows the brand of a source it knows, and a letter tile for one it does not', () => {
    const brand = (value: string) => render(<RankIcon kind="source" value={value} />).container.querySelector('svg')?.getAttribute('data-brand');
    expect(brand('www.google.com')).toBe('google');
    expect(brand('l.instagram.com')).toBe('instagram');
    expect(brand('t.co')).toBe('x');
    expect(render(<RankIcon kind="source" value="example.org" />).container.textContent).toBe('e');
    expect(svgClass(<RankIcon kind="source" value="__direct__" />)).toContain('lucide-link');
    expect(svgClass(<RankIcon kind="source" value="__other__" />)).toContain('lucide-globe');
  });

  it("shows the group site's own logo when the source is one of ours", () => {
    const logo = (value: string) => render(<RankIcon kind="source" value={value} />).container.querySelector('img')?.getAttribute('src');
    expect(logo('take.corpsc.com')).toContain('project-icons%2Ftake.png');
    expect(logo('www.corpsc.com')).toContain('project-icons%2Fcorpsc.png');
    expect(logo('irisnatural.corpsc.com')).toContain('project-icons%2Firis-natural.png');
    expect(logo('corpsc')).toContain('project-icons%2Fcorpsc.png');
  });

  it('shows the browser and the operating system by their marks', () => {
    const brand = (kind: 'browser' | 'os', value: string) =>
      render(<RankIcon kind={kind} value={value} />).container.querySelector('svg')?.getAttribute('data-brand');
    expect(brand('browser', 'Chrome')).toBe('googlechrome');
    expect(brand('browser', 'Safari')).toBe('safari');
    expect(brand('browser', 'Samsung Internet')).toBe('samsung');
    expect(brand('os', 'Android')).toBe('android');
    expect(brand('os', 'iOS')).toBe('ios');
    // Marks the set can't carry fall back to a letter, never to nothing.
    expect(render(<RankIcon kind="browser" value="Edge" />).container.textContent).toBe('E');
    expect(render(<RankIcon kind="os" value="Windows" />).container.textContent).toBe('W');
    expect(svgClass(<RankIcon kind="browser" value="__unknown__" />)).toContain('lucide-globe');
  });

  it('picks the device and channel pictures, with a globe for the unknown', () => {
    expect(svgClass(<RankIcon kind="device" value="mobile" />)).toContain('lucide-smartphone');
    expect(svgClass(<RankIcon kind="device" value="__unknown__" />)).toContain('lucide-globe');
    expect(svgClass(<RankIcon kind="channel" value="Organic Search" />)).toContain('lucide-search');
    expect(svgClass(<RankIcon kind="channel" value="Direct" />)).toContain('lucide-link');
  });
});
