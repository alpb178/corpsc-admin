import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeviceSplit } from './DeviceSplit';

describe('DeviceSplit', () => {
  it('splits the visits by device, largest first, with a picture, share and count each', () => {
    const { container } = render(
      <DeviceSplit
        slices={[
          { value: 'desktop', metrics: { visits: 25 } },
          { value: 'mobile', metrics: { visits: 70 } },
          { value: '__unknown__', metrics: { visits: 5 } },
          { value: 'tablet', metrics: { visits: 0 } },
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.replace(/\s/g, ''))).toEqual(['Móvil70%70', 'Escritorio25%25', 'Desconocido5%5']);
    expect(items[0].querySelector('svg')?.getAttribute('class')).toContain('lucide-smartphone');
    expect(items[1].querySelector('svg')?.getAttribute('class')).toContain('lucide-monitor');
    expect(screen.getByText('100 en total')).toBeTruthy();
    // The bar's segments follow the same order and add up to the whole.
    const widths = [...container.querySelectorAll<HTMLElement>('[aria-hidden] > div')].map((d) => d.style.width);
    expect(widths).toEqual(['70%', '25%', '5%']);
  });

  it('explains an empty split', () => {
    render(<DeviceSplit slices={[]} emptyHint="Llega con el tracker v2." />);
    expect(screen.getByText('Llega con el tracker v2.')).toBeTruthy();
  });
});
