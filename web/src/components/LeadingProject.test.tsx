import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeadingProject } from './LeadingProject';

describe('LeadingProject', () => {
  it('headlines the site, its visits, change, share of the group and a way in', () => {
    render(
      <LeadingProject
        groupVisits={2000}
        range="7d"
        project={{
          slug: 'take',
          name: 'Take',
          kind: 'OWN',
          domain: 'take.corpsc.com',
          metrics: { visits: 1200, page_views: 3400 },
          deltas: { visits: { current: 1200, previous: 1000, change: 0.2, improved: true } },
          trend: [{ date: '2026-09-01', value: 1200 }],
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'Proyecto con más visitas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Take' })).toBeTruthy();
    // The figure, and the same number again as the peak label of its columns.
    expect(screen.getAllByText('1.200').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/\+20\s?%/)).toBeTruthy();
    expect(screen.getByText(/^60\s?%$/)).toBeTruthy();
    expect(screen.getByText('3.400')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver Take/ }).getAttribute('href')).toBe('/projects/take?range=7d');
    expect(screen.getByRole('list', { name: 'visitas por día' })).toBeTruthy();
  });
});
