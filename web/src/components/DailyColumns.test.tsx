import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DailyColumns } from './DailyColumns';

const days = (values: Array<number | null>) =>
  values.map((value, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, value }));

describe('DailyColumns', () => {
  it('draws a column per day, names each one, and writes out the peak', () => {
    render(<DailyColumns points={days([3, 10, null, 0])} noun="visitas" />);

    const list = screen.getByRole('list', { name: 'visitas por día' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[1].getAttribute('aria-label')).toMatch(/2 sept.*10 visitas/);
    expect(items[2].getAttribute('aria-label')).toMatch(/sin datos/);
    // Only the peak carries a visible figure; the rest live in the tooltip.
    expect(within(items[1]).getByText('10')).toBeTruthy();
    expect(within(items[0]).queryByText('3')).toBeNull();
    expect(within(items[0]).getByRole('tooltip').textContent).toMatch(/3 visitas/);
  });

  it('keeps an empty day as a stub and says when there is nothing at all', () => {
    render(<DailyColumns points={days([null, 0])} noun="visitas" />);
    expect(screen.getByText('Sin visitas en este periodo.')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('sums the days of a long range into columns and labels them as spans', () => {
    const year = Array.from({ length: 90 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      value: 1,
    }));
    render(<DailyColumns points={year} noun="visitas" />);

    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeLessThanOrEqual(31);
    expect(items[0].getAttribute('aria-label')).toMatch(/1 ene.*–.*3 visitas/);
  });

  it('says so when there are no days', () => {
    render(<DailyColumns points={[]} noun="visitas" />);
    expect(screen.getByText('Sin datos en este periodo.')).toBeTruthy();
  });
});
