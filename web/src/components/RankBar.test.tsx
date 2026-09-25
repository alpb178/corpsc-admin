import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankBar } from './RankBar';
import type { DimensionSlice } from '@/lib/types';

const slices: DimensionSlice[] = [
  { value: 'BO', metrics: { visits: 80, ctr: 0.1 } },
  { value: '__unknown__', metrics: { visits: 20, ctr: 0.2 } },
  { value: 'PE', metrics: { visits: 0 } },
];

describe('RankBar', () => {
  it('lists values with a label people can read, dropping the empty ones', () => {
    render(<RankBar title="Países" slices={slices} metricKey="visits" />);

    expect(screen.getByText('Bolivia')).toBeTruthy();
    expect(screen.getByText('Desconocido')).toBeTruthy();
    expect(screen.queryByText('Perú')).toBeNull();
  });

  it('scales the fills to the largest value and writes each share of the whole', () => {
    const { container } = render(<RankBar title="Países" slices={slices} metricKey="visits" />);
    const widths = [...container.querySelectorAll<HTMLElement>('li > div[aria-hidden]')].map((d) => d.style.width);
    expect(widths).toEqual(['100%', '25%']);
    expect(screen.getByText(/^80\s?%$/)).toBeTruthy();
    expect(screen.getByText(/^20\s?%$/)).toBeTruthy();
    expect(screen.getByText('100 en total')).toBeTruthy();
  });

  it('shares are of the whole list, the rest included, even when the rows are capped', () => {
    render(<RankBar title="Países" slices={slices} metricKey="visits" limit={1} />);
    expect(screen.getByText(/^80\s?%$/)).toBeTruthy();
    expect(screen.getByText('100 en total')).toBeTruthy();
  });

  it('has no total or share for a list of rates', () => {
    render(<RankBar title="CTR" slices={[{ value: 'a', metrics: { ctr: 0.5 } }]} metricKey="ctr" unit="RATIO" />);
    expect(screen.queryByText(/en total/)).toBeNull();
    expect(screen.queryByText(/^100\s?%$/)).toBeNull();
  });

  it('puts a mark next to each value when told what they are', () => {
    const { container } = render(<RankBar title="Países" slices={slices} metricKey="visits" kind="country" />);
    expect(screen.getByText('🇧🇴')).toBeTruthy();
    // The unknown country gets a globe, not a broken flag.
    expect(container.querySelectorAll('li svg')).toHaveLength(1);
  });

  it('adds a secondary figure with its explanation', () => {
    render(
      <RankBar title="Países" slices={slices} metricKey="visits" secondary={{ key: 'ctr', unit: 'RATIO', label: 'CTR' }} />,
    );
    expect(screen.getByText(/La segunda cifra es ctr/)).toBeTruthy();
  });

  it('explains an empty list', () => {
    render(<RankBar title="Eventos" slices={[]} metricKey="custom_events" emptyHint="Sin eventos." />);
    expect(screen.getByText('Sin eventos.')).toBeTruthy();
  });

  it('respects the limit', () => {
    render(<RankBar title="Países" slices={slices} metricKey="visits" limit={1} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

describe('RankBar labels', () => {
  it('uses the label function it is given', () => {
    render(<RankBar title="Idiomas" slices={[{ value: 'es', metrics: { visits: 1 } }]} metricKey="visits" labelOf={(v) => `idioma ${v}`} />);
    expect(screen.getByText('idioma es')).toBeTruthy();
  });
});
