import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PathTable } from './PathTable';

const slices = [
  { value: '/es', metrics: { visits: 60 } },
  { value: '__other__', metrics: { visits: 30 } },
  { value: '/en', metrics: { visits: 10 } },
  { value: '/never', metrics: { visits: 0 } },
];

describe('PathTable', () => {
  it('lists the pages with their visits and share, naming the rest as such', () => {
    render(<PathTable title="Páginas de entrada" slices={slices} emptyText="nada" table="landing" />);

    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent?.replace(/\s/g, ''));
    expect(rows).toEqual(['/es6060%', 'Resto3030%', '/en1010%']);
  });

  it('offers to delete a page but never the rest bucket', () => {
    render(
      <PathTable
        title="Páginas de salida"
        slices={slices}
        emptyText="nada"
        table="exit"
        deletion={{ action: vi.fn(), slug: 'take', from: '2026-09-01', to: '2026-09-28' }}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: /^Borrar/ });
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Borrar las visitas que salieron desde /es',
      'Borrar las visitas que salieron desde /en',
    ]);
  });

  it('explains an empty table', () => {
    render(<PathTable title="Páginas de entrada" slices={[]} emptyText="Sin datos." table="landing" />);
    expect(screen.getByText('Sin datos.')).toBeTruthy();
  });
});
