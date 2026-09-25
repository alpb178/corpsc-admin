import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeltaPill } from './DeltaPill';

describe('DeltaPill', () => {
  it('says how much, which way and against what', () => {
    render(<DeltaPill delta={{ current: 1200, previous: 1000, change: 0.2, improved: true }} />);

    const pill = screen.getByText(/\+20\s?%/);
    expect(pill.className).toContain('text-positive');
    expect(screen.getByText('sube')).toBeTruthy();
    expect(screen.getByText(/vs 1.000/)).toBeTruthy();
  });

  it('paints a worsening red even when the figure went up', () => {
    // More cancellations is bad news: the API says so with `improved`.
    render(<DeltaPill delta={{ current: 12, previous: 10, change: 0.2, improved: false }} />);
    expect(screen.getByText(/\+20\s?%/).className).toContain('text-negative');
    expect(screen.getByText('sube')).toBeTruthy();
  });

  it('stays neutral when there is no base to compare against', () => {
    render(<DeltaPill delta={{ current: 5, previous: 0, change: null, improved: null }} />);
    expect(screen.getByText(/sin base/).className).toContain('text-fg-subtle');
    expect(screen.getByText('sin cambio')).toBeTruthy();
  });

  it('treats a change that rounds to 0 % as no change, whichever way it leaned', () => {
    render(<DeltaPill delta={{ current: 4291, previous: 4293, change: -0.0004, improved: false }} />);
    expect(screen.getByText(/0\s?%/).className).toContain('text-fg-subtle');
    expect(screen.getByText('sin cambio')).toBeTruthy();
  });

  it('drops the previous figure in its compact form', () => {
    render(<DeltaPill delta={{ current: 5, previous: 10, change: -0.5, improved: false }} compact />);
    expect(screen.getByText(/-50\s?%/)).toBeTruthy();
    expect(screen.queryByText(/vs/)).toBeNull();
    expect(screen.getByText('baja')).toBeTruthy();
  });
});
