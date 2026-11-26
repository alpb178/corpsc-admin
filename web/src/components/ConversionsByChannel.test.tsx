import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ConversionsByChannel,
  conversionRowsOf,
  formatConversionRate,
  labelOrigin,
} from './ConversionsByChannel';

describe('formatConversionRate', () => {
  it('writes conversions over visits with one decimal and a decimal comma', () => {
    expect(formatConversionRate(9, 412)).toMatch(/^2,2\s?%$/);
    expect(formatConversionRate(1, 3)).toMatch(/^33,3\s?%$/);
  });

  it('writes a dash when there are no visits to divide by', () => {
    expect(formatConversionRate(1, 0)).toBe('—');
    expect(formatConversionRate(1, undefined)).toBe('—');
  });
});

describe('labelOrigin', () => {
  it('names the reserved origins in words', () => {
    expect(labelOrigin('__unknown__')).toBe('Sin origen');
    expect(labelOrigin('__direct__')).toBe('(directo)');
    expect(labelOrigin('__other__')).toBe('Resto');
    expect(labelOrigin('Organic Social')).toBe('Redes sociales');
    expect(labelOrigin('instagram')).toBe('instagram');
  });
});

describe('conversionRowsOf', () => {
  it('sorts by conversions and leaves out origins that never converted', () => {
    const rows = conversionRowsOf([
      { value: 'Direct', metrics: { visits: 180, conversions: 2 } },
      { value: 'Referral', metrics: { visits: 50 } },
      { value: 'Organic Social', metrics: { visits: 412, conversions: 9 } },
      { value: 'Email', metrics: { visits: 20, conversions: 0 } },
      { value: '__unknown__', metrics: { conversions: 1 } },
      { value: 'Organic Search', metrics: { visits: 230, conversions: 4 } },
    ]);

    expect(rows.map((r) => [r.value, r.conversions])).toEqual([
      ['Organic Social', 9],
      ['Organic Search', 4],
      ['Direct', 2],
      ['__unknown__', 1],
    ]);
  });

  it('breaks a tie by visits', () => {
    const rows = conversionRowsOf([
      { value: 'a', metrics: { visits: 10, conversions: 1 } },
      { value: '__unknown__', metrics: { conversions: 1 } },
      { value: 'b', metrics: { visits: 30, conversions: 1 } },
    ]);
    expect(rows.map((r) => r.value)).toEqual(['b', 'a', '__unknown__']);
  });
});

describe('ConversionsByChannel', () => {
  it('draws one table by channel and one by source', () => {
    render(
      <ConversionsByChannel
        channels={[
          { value: 'Direct', metrics: { visits: 180, conversions: 2 } },
          { value: 'Organic Social', metrics: { visits: 412, conversions: 9 } },
          { value: '__unknown__', metrics: { conversions: 1 } },
        ]}
        sources={[
          { value: '__direct__', metrics: { visits: 180, conversions: 2 } },
          { value: 'instagram', metrics: { visits: 300, conversions: 0 } },
        ]}
      />,
    );

    const byChannel = screen.getByText('Conversiones por canal').closest('section') ?? document.body;
    const channelRows = within(byChannel as HTMLElement)
      .getAllByRole('row')
      .slice(1)
      .map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.replace(/\s/g, ' ')));
    expect(channelRows).toEqual([
      ['Redes sociales', '412', '9', expect.stringMatching(/^2,2 ?%$/)],
      ['Directo', '180', '2', expect.stringMatching(/^1,1 ?%$/)],
      ['Sin origen', '—', '1', '—'],
    ]);

    expect(screen.getByText('Conversiones por fuente')).toBeTruthy();
    expect(screen.getByText('(directo)')).toBeTruthy();
    expect(screen.queryByText('instagram')).toBeNull();
  });

  it('says so when nothing converted in the period', () => {
    render(<ConversionsByChannel channels={[{ value: 'Direct', metrics: { visits: 5 } }]} sources={[]} />);
    expect(screen.getAllByText('Sin conversiones en este periodo.')).toHaveLength(2);
  });
});
