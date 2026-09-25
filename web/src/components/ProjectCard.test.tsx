import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectCard } from './ProjectCard';
import { ProjectCards } from './ProjectCards';
import type { ProjectCardData } from '@/lib/dashboard';
import type { ProjectSummary } from '@/lib/types';

const card: ProjectCardData = {
  slug: 'take',
  name: 'Take',
  kind: 'OWN',
  domain: 'take.corpsc.com',
  logo: '/project-icons/take.png',
  metrics: { visits: 1200, page_views: 3400, clicks: 120, orders: 8 },
  deltas: {
    visits: { current: 1200, previous: 1000, change: 0.2, improved: true },
    page_views: { current: 3400, previous: 4000, change: -0.15, improved: false },
    clicks: { current: 120, previous: 120, change: 0, improved: null },
    orders: { current: 8, previous: 0, change: null, improved: null },
  },
  trend: [
    { date: '2026-09-01', value: 500 },
    { date: '2026-09-02', value: 700 },
  ],
};

describe('ProjectCard', () => {
  it('opens the site with the range, and shows its visits, change, days and figures', () => {
    render(<ProjectCard project={card} range="7d" />);

    const link = screen.getByRole('link', { name: /Take/ });
    expect(link.getAttribute('href')).toBe('/projects/take?range=7d');
    expect(within(link).getByText('take.corpsc.com')).toBeTruthy();
    expect(within(link).getByText('Propio')).toBeTruthy();
    expect(within(link).getByText('1.200')).toBeTruthy();
    expect(within(link).getByText(/\+20\s?%/)).toBeTruthy();
    expect(within(link).getByRole('list', { name: 'visitas por día' })).toBeTruthy();
    // The third figure is whatever business metric the site sends.
    expect(within(link).getByText('Pedidos')).toBeTruthy();
    expect(within(link).getByText('8')).toBeTruthy();
    expect(within(link).getByText(/-15\s?%/)).toBeTruthy();
  });

  it('says when there is no previous period, and shows initials without a logo', () => {
    render(
      <ProjectCard
        project={{ ...card, logo: undefined, kind: 'CLIENT', deltas: undefined, metrics: { visits: 3 } }}
        range={null}
      />,
    );

    expect(screen.getByRole('link').getAttribute('href')).toBe('/projects/take');
    expect(screen.getByText('sin periodo anterior')).toBeTruthy();
    expect(screen.getByText('Cliente')).toBeTruthy();
    expect(screen.getByText('TA')).toBeTruthy();
    // Metrics the site doesn't send are dashes, not zeros.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});

describe('ProjectCards', () => {
  const summary = (slug: string, name: string, visits?: number): ProjectSummary => ({
    slug,
    name,
    kind: 'OWN',
    domain: `${slug}.corpsc.com`,
    metrics: visits === undefined ? {} : { visits },
  });

  it('orders the sites by visits and names the quiet ones apart', () => {
    render(
      <ProjectCards
        overview={{
          projects: [summary('corpsc', 'CORPSC', 10), summary('take', 'Take', 50), summary('invoices', 'Invoices')],
          seriesByProject: [],
        }}
        range={null}
      />,
    );

    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Take', 'CORPSC']);
    expect(screen.getByText('2 sitios con tráfico · de más a menos visitas')).toBeTruthy();
    expect(screen.getByText('Sin datos en este periodo: Invoices.')).toBeTruthy();
  });

  it('says when no site has traffic', () => {
    render(<ProjectCards overview={{ projects: [summary('take', 'Take')], seriesByProject: [] }} range={null} />);
    expect(screen.getByText('Ningún sitio tiene visitas en este periodo.')).toBeTruthy();
  });
});
