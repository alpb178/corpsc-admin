import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CountriesCard } from './CountriesCard';
import { markersFor, stepOf } from './WorldMap';

// The map itself is the library's; what matters here is what it is given.
vi.mock('react-svg-worldmap', () => ({
  regions: [{ name: 'Bolivia', code: 'BO' }, { name: 'Peru', code: 'PE' }],
  default: ({ data }: { data: Array<{ country: string; value: number }> }) => (
    <svg data-testid="map" data-countries={data.map((d) => `${d.country}:${d.value}`).join(',')} />
  ),
}));

describe('CountriesCard', () => {
  it('maps the countries with a code and lists them all with their flags and shares', async () => {
    render(
      <CountriesCard
        slices={[
          { value: 'BO', metrics: { visits: 60 } },
          { value: '__unknown__', metrics: { visits: 30 } },
          { value: 'PE', metrics: { visits: 10 } },
        ]}
      />,
    );

    // The map loads on the client only, so it arrives a tick later.
    expect((await screen.findByTestId('map')).getAttribute('data-countries')).toBe('bo:60,pe:10');
    expect(screen.getByText('2 países · 100 en total')).toBeTruthy();
    expect(screen.getByText('🇧🇴')).toBeTruthy();
    expect(screen.getByText('Desconocido')).toBeTruthy();
    expect(screen.getByText(/^60\s?%$/)).toBeTruthy();
    expect(screen.queryByText(/Sin dibujo/)).toBeNull();
  });

  it('names the countries the map has no shape for', () => {
    render(<CountriesCard slices={[{ value: 'BO', metrics: { visits: 5 } }, { value: 'SG', metrics: { visits: 1 } }]} />);
    expect(screen.getByText('Sin dibujo en el mapa: Singapur.')).toBeTruthy();
  });

  it('draws no map when only unknown countries have visits, and explains an empty list', () => {
    const { rerender } = render(<CountriesCard slices={[{ value: '__unknown__', metrics: { visits: 3 } }]} />);
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.getByText('Desconocido')).toBeTruthy();

    rerender(<CountriesCard slices={[]} />);
    expect(screen.getByText('Sin datos en este periodo.')).toBeTruthy();
  });
});

describe('stepOf', () => {
  it('darkens with the share of the top country', () => {
    expect(stepOf(1)).toBe('#0f52bd');
    expect(stepOf(0.5)).toBe('#1668e3');
    expect(stepOf(0.3)).toBe('#5b96ea');
    expect(stepOf(0.1)).toBe('#9dc1f3');
    expect(stepOf(0.01)).toBe('#cfe0fa');
  });
});

describe('markersFor', () => {
  it('marks only the countries that have visits and no visible shape', () => {
    const box = (width: number, height = width) => ({ x: 10, y: 20, width, height });
    const markers = markersFor(
      [
        { code: 'lu', box: box(1.2) },
        { code: 'bo', box: box(40) },
        { code: 'mt', box: box(0.5) },
        { code: 'sg', box: box(0.8) },
      ],
      new Map([['LU', 3], ['BO', 100], ['MT', 1]]),
    );
    expect(markers).toEqual([
      { code: 'LU', cx: 10.6, cy: 20.6, value: 3 },
      { code: 'MT', cx: 10.25, cy: 20.25, value: 1 },
    ]);
  });
});
