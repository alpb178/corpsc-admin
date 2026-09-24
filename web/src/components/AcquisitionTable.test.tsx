import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AcquisitionTable } from './AcquisitionTable';

describe('AcquisitionTable', () => {
  it('reads each route of arrival in words', () => {
    render(
      <AcquisitionTable
        slices={[
          { value: 'Organic Search | google.com | /es/servicios', metrics: { visits: 12 } },
          { value: 'Direct | __direct__ | /', metrics: { visits: 3 } },
        ]}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toEqual(['Búsqueda orgánicagoogle.com/es/servicios12', 'DirectoDirecto/3']);
  });

  it('explains an empty table', () => {
    render(<AcquisitionTable slices={[]} />);
    expect(screen.getByText(/tracker v2/)).toBeTruthy();
  });
});
