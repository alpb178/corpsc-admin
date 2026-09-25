import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HourlyActivity } from './HourlyActivity';

const hour = (h: string, visits: number) => ({ value: h, metrics: { visits } });

describe('HourlyActivity', () => {
  it('names the peak hour and the busiest part of the day, with a share per band', () => {
    render(<HourlyActivity slices={[hour('09', 3), hour('14', 5), hour('15', 2)]} timezone="America/La_Paz" />);

    expect(screen.getByText('14:00')).toBeTruthy();
    expect(screen.getByText('tarde')).toBeTruthy();
    expect(screen.getByText('America/La_Paz')).toBeTruthy();
    // 24 columns, every hour kept, the empty ones included.
    const items = within(screen.getByRole('list', { name: 'Visitas por hora' })).getAllByRole('listitem');
    expect(items).toHaveLength(24);
    expect(items[14].getAttribute('aria-label')).toBe('14:00 — 5 visitas');
    expect(within(items[3]).getByRole('tooltip').textContent).toBe('03:00–03:59 — 0 visitas');
    // Bands: morning 3 of 10, afternoon 7 of 10.
    expect(screen.getByText(/^30\s?%$/)).toBeTruthy();
    expect(screen.getByText(/^70\s?%$/)).toBeTruthy();
    expect(screen.getAllByText(/^0\s?%$/)).toHaveLength(2);
  });

  it('says so when there is nothing', () => {
    render(<HourlyActivity slices={[]} timezone="UTC" />);
    expect(screen.getByText('Sin datos en este periodo.')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
