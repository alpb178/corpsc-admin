import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventsTable } from './EventsTable';

describe('EventsTable', () => {
  it('lists events with their conversions once the project has goals', () => {
    render(
      <EventsTable
        slices={[
          { value: 'contact_submit', metrics: { custom_events: 5, conversions: 5 } },
          { value: 'whatsapp_click', metrics: { custom_events: 2 } },
          { value: '__other__', metrics: { custom_events: 9 } },
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Conversiones' })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toEqual(['contact_submit55', 'whatsapp_click2—']);
  });

  it('leaves the conversions column out without goals', () => {
    render(<EventsTable slices={[{ value: 'scroll_end', metrics: { custom_events: 1 } }]} />);
    expect(screen.queryByRole('columnheader', { name: 'Conversiones' })).toBeNull();
  });

  it('explains how to send events when there are none', () => {
    render(<EventsTable slices={[]} />);
    expect(screen.getByText(/track\('nombre'\)/)).toBeTruthy();
  });
});
