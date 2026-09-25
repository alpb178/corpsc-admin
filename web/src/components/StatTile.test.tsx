import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('shows the figure, its hint and the change with a direction and the previous value', () => {
    render(
      <StatTile
        label="Visitas"
        hint="sesiones"
        value={1200}
        delta={{ current: 1200, previous: 1000, change: 0.2, improved: true }}
      />,
    );

    expect(screen.getByText('Visitas')).toBeTruthy();
    expect(screen.getByText('sesiones')).toBeTruthy();
    expect(screen.getByText('1.200')).toBeTruthy();
    expect(screen.getByText(/\+20\s?%/).className).toContain('text-positive');
    expect(screen.getByText('sube')).toBeTruthy();
    expect(screen.getByText(/vs 1.000/)).toBeTruthy();
  });

  it('marks a worsening and a change it cannot judge', () => {
    const { rerender } = render(
      <StatTile label="x" value={5} delta={{ current: 5, previous: 10, change: -0.5, improved: false }} />,
    );
    expect(screen.getByText(/-50\s?%/).className).toContain('text-negative');

    rerender(<StatTile label="x" value={5} delta={{ current: 5, previous: 0, change: null, improved: null }} />);
    expect(screen.getByText(/sin base/).className).toContain('text-fg-subtle');
  });

  it('shows a dash, not a zero, when there is no figure', () => {
    render(<StatTile label="Visitantes únicos" value={undefined} hero />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('draws the sparkline only when there is a figure and some day had data', () => {
    const trend = [
      { date: '2026-09-01', value: 4 },
      { date: '2026-09-02', value: null },
      { date: '2026-09-03', value: 9 },
    ];
    const { container, rerender } = render(<StatTile label="Visitas" value={13} trend={trend} />);
    const bars = container.querySelectorAll('[aria-hidden] > span');
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute('title')).toMatch(/1 sept.*4/);
    expect(bars[1].getAttribute('title')).toMatch(/sin datos/);
    // The latest column is in full ink; the earlier ones are lighter.
    expect(bars[2].classList.contains('bg-accent')).toBe(true);
    expect(bars[0].classList.contains('bg-accent/30')).toBe(true);

    rerender(<StatTile label="Visitas" value={13} trend={trend.map((d) => ({ ...d, value: null }))} />);
    expect(container.querySelectorAll('[aria-hidden] > span')).toHaveLength(0);

    rerender(<StatTile label="Visitas" value={undefined} trend={trend} />);
    expect(container.querySelectorAll('[aria-hidden] > span')).toHaveLength(0);
  });
});
