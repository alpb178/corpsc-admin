import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLL_MS, RealtimePanel } from './RealtimePanel';
import type { RealtimeSnapshot } from '@/lib/types';

const NOW = Date.parse('2026-09-24T15:00:00.000Z');

function snapshot(overrides: Partial<RealtimeSnapshot> = {}): RealtimeSnapshot {
  return {
    minutes: 5,
    activeVisitors: 3,
    byProject: [
      { slug: 'take', name: 'Take', activeVisitors: 2 },
      { slug: 'corpsc', name: 'CORPSC', activeVisitors: 1 },
    ],
    recent: [
      {
        at: new Date(NOW - 12_000).toISOString(),
        project: { slug: 'take', name: 'Take' },
        type: 'page_view',
        path: '/products/crema',
        country: 'BO',
        city: 'La Paz, BO',
        device: 'mobile',
        source: 'instagram',
        detail: null,
      },
      {
        at: new Date(NOW - 3 * 60_000).toISOString(),
        project: { slug: 'corpsc', name: 'CORPSC' },
        type: 'custom',
        path: '/contacto',
        country: 'PE',
        city: null,
        device: null,
        source: null,
        detail: 'contact_submit',
      },
    ],
    lastEventAt: new Date(NOW - 12_000).toISOString(),
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot({ activeVisitors: 7 }))));
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RealtimePanel', () => {
  it('opens with the server snapshot: active users, per site and latest events', () => {
    render(<RealtimePanel initial={snapshot()} />);

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('en los últimos 5 min')).toBeTruthy();
    expect(screen.getByText('hace 12 s')).toBeTruthy();
    expect(screen.getByText('hace 3 min')).toBeTruthy();
    expect(screen.getByText('La Paz, BO · instagram · Móvil')).toBeTruthy();
    expect(screen.getByText(/contact_submit/)).toBeTruthy();
    expect(screen.getByText('Perú')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls every 20 seconds', async () => {
    render(<RealtimePanel initial={snapshot()} />);

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchMock).toHaveBeenCalledWith('/api/realtime', { cache: 'no-store' });
    expect(screen.getByText('7')).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks for one site, and leaves the per-site list out there', async () => {
    render(<RealtimePanel initial={snapshot()} project="take" />);
    expect(screen.queryByText('CORPSC')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(fetchMock).toHaveBeenCalledWith('/api/realtime?project=take', { cache: 'no-store' });
  });

  it('stops while the tab is hidden and catches up when it comes back', async () => {
    render(<RealtimePanel initial={snapshot()} />);

    act(() => setVisibility('hidden'));
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 3));
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => setVisibility('visible'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the last snapshot and says so when a poll fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 502 })).mockRejectedValueOnce(new Error('offline'));
    render(<RealtimePanel initial={snapshot()} />);

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByRole('status').textContent).toMatch(/Sin conexión/);
    expect(screen.getByText('3')).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('says there is nothing yet without a first snapshot, and without events', () => {
    const { unmount } = render(<RealtimePanel initial={null} />);
    expect(screen.getByText('Todavía no hay datos en tiempo real.')).toBeTruthy();
    unmount();

    // `initial` is only the first snapshot: a new one needs a new mount.
    render(<RealtimePanel initial={snapshot({ recent: [], byProject: [], activeVisitors: 0 })} />);
    expect(screen.getByText('Ningún evento todavía.')).toBeTruthy();
  });

  it('stops polling when unmounted', async () => {
    const { unmount } = render(<RealtimePanel initial={snapshot()} />);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(POLL_MS * 2));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
