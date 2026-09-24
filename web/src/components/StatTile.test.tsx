import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('shows the figure, its hint and the change with an arrow and the previous value', () => {
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
    expect(screen.getByText(/↑/).className).toContain('--positive');
    expect(screen.getByText(/vs 1.000/)).toBeTruthy();
  });

  it('marks a worsening and a change it cannot judge', () => {
    const { rerender } = render(
      <StatTile label="x" value={5} delta={{ current: 5, previous: 10, change: -0.5, improved: false }} />,
    );
    expect(screen.getByText(/↓/).className).toContain('--negative');

    rerender(<StatTile label="x" value={5} delta={{ current: 5, previous: 0, change: null, improved: null }} />);
    expect(screen.getByText(/→ sin base/).className).toContain('text-fg-subtle');
  });

  it('shows a dash, not a zero, when there is no figure', () => {
    render(<StatTile label="Visitantes únicos" value={undefined} hero />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
