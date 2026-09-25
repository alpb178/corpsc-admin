import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecentEventsTable } from './RecentEventsTable';
import type { RecentEvent } from '@/lib/types';

const NOW = Date.parse('2026-09-25T22:00:00.000Z');
const events: RecentEvent[] = [
  {
    id: '7',
    at: new Date(NOW - 45_000).toISOString(),
    project: { slug: 'take', name: 'Take' },
    type: 'page_view',
    path: '/products',
    country: 'BO',
    city: null,
    device: 'desktop',
    source: 'google.com',
    detail: null,
  },
  {
    id: '8',
    at: new Date(NOW - 2 * 3_600_000).toISOString(),
    project: { slug: 'corpsc', name: 'CORPSC' },
    type: 'custom',
    path: '/contacto',
    country: null,
    city: null,
    device: null,
    source: null,
    detail: 'contact_submit',
  },
];

describe('RecentEventsTable', () => {
  it('reads each event against the clock it is given, with its site when asked', () => {
    render(<RecentEventsTable events={events} now={NOW} showProject />);

    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toEqual(['hace 45 sTakeVisita a /productsBolivia · google.com · Escritorio', 'hace 2 hCORPSCEvento en /contacto · contact_submit']);
  });

  it('shows the hour instead when it is not live, and leaves the site out for one site', () => {
    render(<RecentEventsTable events={events} showProject={false} />);

    expect(screen.queryByRole('columnheader', { name: 'Sitio' })).toBeNull();
    expect(screen.getAllByRole('row')[1].textContent).toMatch(/^25 sept, 17:59/);
  });

  it("deletes by event id, on the event's own site", () => {
    render(
      <RecentEventsTable events={events} now={NOW} showProject deletion={{ action: vi.fn(), from: '2026-09-01', to: '2026-09-28' }} />,
    );
    expect(screen.getByRole('button', { name: 'Borrar el evento de CORPSC en /contacto' })).toBeTruthy();
    expect(screen.getByText('Últimos eventos')).toBeTruthy();
  });
});
