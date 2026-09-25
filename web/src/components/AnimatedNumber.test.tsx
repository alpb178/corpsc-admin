import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedNumber } from './AnimatedNumber';

const digits = (text: string | null) => Number((text ?? '').replace(/\D/g, ''));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AnimatedNumber', () => {
  it('renders the final figure on the server and counts up to it once mounted', () => {
    const { container } = render(<AnimatedNumber value={1000} duration={400} />);
    const span = container.firstElementChild!;
    // Before any frame runs, the text is the figure itself: no 0 flashes.
    expect(span.textContent).toBe('1.000');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    const midway = digits(span.textContent);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1000);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(span.textContent).toBe('1.000');
  });

  it('rolls from the figure on screen to the new one, not from 0', () => {
    const { container, rerender } = render(<AnimatedNumber value={100} duration={400} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    rerender(<AnimatedNumber value={200} duration={400} />);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const midway = digits(container.firstElementChild!.textContent);
    expect(midway).toBeGreaterThan(100);
    expect(midway).toBeLessThan(200);
  });

  it('just shows the figure when the viewer asked for less motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const raf = vi.spyOn(window, 'requestAnimationFrame');

    const { container } = render(<AnimatedNumber value={1000} />);
    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect(container.firstElementChild!.textContent).toBe('1.000');
    expect(raf).not.toHaveBeenCalled();
  });

  it('shows a dash for a missing figure and respects the unit', () => {
    const { container, rerender } = render(<AnimatedNumber value={undefined} />);
    expect(container.textContent).toBe('—');

    rerender(<AnimatedNumber value={0.256} unit="RATIO" />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.textContent).toMatch(/25,6\s?%/);
  });
});
