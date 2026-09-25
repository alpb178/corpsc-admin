import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteNavigation } from './SiteNavigation';
import type { DimensionSlice } from '@/lib/types';

const pages: DimensionSlice[] = [
  { value: '/es', metrics: { page_views: 40, clicks: 5 } },
  { value: '/es/ofertas', metrics: { page_views: 12, clicks: 1 } },
  { value: '__other__', metrics: { page_views: 3 } },
  { value: '/never', metrics: { page_views: 0 } },
];
const elements: DimensionSlice[] = [
  { value: '/es | hero | Ver ofertas', metrics: { clicks: 4 } },
  { value: '/es/ofertas | lista | Aplicar', metrics: { clicks: 1 } },
  { value: '/es | footer | Contacto', metrics: { clicks: 1 } },
  { value: '__other__', metrics: { clicks: 2 } },
  { value: 'broken', metrics: { clicks: 9 } },
];

const table = (name: string) => screen.getByRole('heading', { name }).closest('section')!;
const rowsOf = (name: string) => within(table(name)).getAllByRole('row').slice(1);

describe('SiteNavigation', () => {
  it('lists the pages most viewed first and every click target with its page', () => {
    render(<SiteNavigation pages={pages} elements={elements} />);

    expect(rowsOf('Páginas visitadas').map((r) => r.textContent)).toEqual(['/es405', '/es/ofertas121', 'Resto3—']);
    expect(rowsOf('Dónde hacen clic').map((r) => r.textContent)).toEqual([
      'Ver ofertashero/es4',
      'Aplicarlista/es/ofertas1',
      'Contactofooter/es1',
    ]);
  });

  it('narrows the clicks to the page picked, and lets go of it', () => {
    render(<SiteNavigation pages={pages} elements={elements} />);

    fireEvent.click(screen.getByRole('button', { name: '/es' }));
    expect(screen.getByText('En /es')).toBeTruthy();
    expect(rowsOf('Dónde hacen clic')).toHaveLength(2);
    // With one page picked its column says nothing: it goes.
    expect(within(table('Dónde hacen clic')).queryByRole('columnheader', { name: 'Página' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }));
    expect(screen.getByText('En todas las páginas')).toBeTruthy();
    expect(rowsOf('Dónde hacen clic')).toHaveLength(3);
  });

  it('explains empty tables, telling no clicks at all from none on the page picked', () => {
    const { rerender } = render(<SiteNavigation pages={[]} elements={[]} />);
    expect(screen.getByText('Sin páginas vistas en este periodo.')).toBeTruthy();
    expect(screen.getByText(/Sin clics registrados/)).toBeTruthy();

    rerender(<SiteNavigation pages={pages} elements={[{ value: '/other | x | y', metrics: { clicks: 2 } }]} />);
    fireEvent.click(screen.getByRole('button', { name: '/es' }));
    expect(screen.getByText('Ningún clic en esta página durante el periodo.')).toBeTruthy();
  });

  it('offers to delete a page or an element, never the rest bucket', () => {
    render(
      <SiteNavigation
        pages={pages}
        elements={elements}
        deletion={{ action: vi.fn(), slug: 'take', from: '2026-09-01', to: '2026-09-28' }}
      />,
    );
    expect(within(table('Páginas visitadas')).getAllByRole('button', { name: /^Borrar/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Borrar la página /es',
      'Borrar la página /es/ofertas',
    ]);
    expect(within(table('Dónde hacen clic')).getAllByRole('button', { name: /^Borrar/ })).toHaveLength(3);
  });
});
