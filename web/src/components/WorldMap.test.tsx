import { render, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorldMap } from './WorldMap';

// A map of three shapes, drawn in the order of `regions`, each telling its
// box through a data attribute so `getBBox` —which jsdom lacks— can answer.
vi.mock('react-svg-worldmap', () => ({
  regions: [
    { name: 'Bolivia', code: 'BO' },
    { name: 'Luxembourg', code: 'LU' },
    { name: 'Peru', code: 'PE' },
  ],
  default: () => (
    <svg>
      <g>
        <path data-box='{"x":100,"y":200,"width":60,"height":40}' />
        <path data-box='{"x":400,"y":90,"width":1.2,"height":1}' />
        <path data-box='{"x":90,"y":180,"width":30,"height":50}' />
      </g>
    </svg>
  ),
}));

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value(this: SVGElement) {
      return JSON.parse(this.getAttribute('data-box') ?? '{"x":0,"y":0,"width":0,"height":0}');
    },
  });
});

afterAll(() => {
  delete (SVGElement.prototype as { getBBox?: unknown }).getBBox;
});

describe('WorldMap', () => {
  it('puts a dot on a speck with visits, inside the map, and none on a shape people can see', async () => {
    const { container } = render(
      <WorldMap countries={[{ code: 'BO', value: 90 }, { code: 'LU', value: 10 }]} />,
    );

    await waitFor(() => expect(container.querySelector('[data-markers] circle')).toBeTruthy());
    const dots = container.querySelectorAll('[data-markers] circle');
    expect(dots).toHaveLength(1);
    const dot = dots[0];
    expect(dot.parentElement?.parentElement?.tagName).toBe('g');
    expect(dot.getAttribute('cx')).toBe('400.6');
    expect(dot.getAttribute('cy')).toBe('90.5');
    // Never the palest step, whatever its share.
    expect(dot.getAttribute('fill')).toBe('#5b96ea');
    expect(dot.querySelector('title')?.textContent).toMatch(/^Luxemburgo: 10 visitas \(10\s?%\)$/);
  });

  it('paints again for new figures, and leaves nothing when no speck has visits', async () => {
    const { container, rerender } = render(<WorldMap countries={[{ code: 'LU', value: 10 }]} />);
    await waitFor(() => expect(container.querySelectorAll('[data-markers] circle')).toHaveLength(1));
    expect(container.querySelector('[data-markers] circle')?.getAttribute('fill')).toBe('#0f52bd');

    rerender(<WorldMap countries={[{ code: 'PE', value: 3 }]} />);
    await waitFor(() => expect(container.querySelector('[data-markers]')).toBeNull());
  });
});
