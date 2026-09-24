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

  it('scales the bars to the largest value', () => {
    const { container } = render(<RankBar title="Países" slices={slices} metricKey="visits" />);
    const widths = [...container.querySelectorAll<HTMLElement>('li div > div')].map((d) => d.style.width);
    expect(widths).toEqual(['100%', '25%']);
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
