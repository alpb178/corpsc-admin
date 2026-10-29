import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrendChart } from './TrendChart';

const data = [
  { date: '2026-09-01', visits: 10, visitors: 8 },
  { date: '2026-09-02', visits: 20, visitors: 6 },
];

describe('TrendChart', () => {
  it('shows each line\'s total next to its name in the legend', () => {
    render(
      <TrendChart
        data={data}
        series={[
          { key: 'visits', label: 'Visitas', slot: 1, total: 30 },
          { key: 'visitors', label: 'Visitantes únicos', slot: 2, total: 12 },
        ]}
      />,
    );

    expect(screen.getByText('Visitas').closest('li')?.textContent).toBe('Visitas30');
    expect(screen.getByText('Visitantes únicos').closest('li')?.textContent).toBe('Visitantes únicos12');
  });

  it('has no legend at all for a single series: the title already names it', () => {
    render(<TrendChart data={data} series={[{ key: 'visits', label: 'Visitas', slot: 1, total: 30 }]} />);

    expect(screen.queryByText('30')).toBeNull();
  });
});
