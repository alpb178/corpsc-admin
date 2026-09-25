import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoRefresh, REFRESH_MS } from './AutoRefresh';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  router.refresh.mockClear();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AutoRefresh', () => {
  it('refreshes the page every minute while the tab is visible, and says how long ago', () => {
    render(<AutoRefresh />);
    expect(screen.getByRole('status').textContent).toBe('Se actualiza cada minuto');

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByRole('status').textContent).toBe('Actualizado hace 5 s');
    expect(router.refresh).not.toHaveBeenCalled();

    // The refresh lands at the minute and the clock starts over from it.
    act(() => {
      vi.advanceTimersByTime(REFRESH_MS - 5_000);
    });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('Actualizado hace 0 s');
  });

  it('waits while the tab is hidden and catches up when it is seen again', () => {
    render(<AutoRefresh everyMs={1_000} />);

    act(() => setVisibility('hidden'));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(router.refresh).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    expect(router.refresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it('refreshes by hand', () => {
    render(<AutoRefresh />);
    fireEvent.click(screen.getByRole('button'));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
});
