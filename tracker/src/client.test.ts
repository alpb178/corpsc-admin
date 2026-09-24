import { Tracker, getTracker, resetTrackerForTests, track } from './client';

type Sent = { events: Array<Record<string, unknown>> };

let fetchMock: ReturnType<typeof vi.fn>;
let beaconMock: ReturnType<typeof vi.fn>;

function fetched(): Sent[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as Sent);
}

async function beaconed(): Promise<Sent[]> {
  return Promise.all(beaconMock.mock.calls.map(async ([, blob]) => JSON.parse(await (blob as Blob).text()) as Sent));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetTrackerForTests();
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  beaconMock = vi.fn().mockReturnValue(true);
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'sendBeacon', { value: beaconMock, configurable: true });
  window.history.replaceState(null, '', '/es/precios');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Tracker', () => {
  it('waits for company before sending, then sends one batch', async () => {
    const tracker = new Tracker();
    tracker.enqueue({ type: 'click', path: '/', section: 'hero', label: 'A' });
    tracker.enqueue({ type: 'click', path: '/', section: 'hero', label: 'B' });
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/hub-track');
    expect((init as RequestInit).keepalive).toBe(true);
    expect(fetched()[0].events.map((e) => e.label)).toEqual(['A', 'B']);
  });

  it('gives every event its own id and browser instant', () => {
    const tracker = new Tracker();
    tracker.enqueue({ type: 'page_view', path: '/' }, { immediate: true });
    tracker.enqueue({ type: 'page_view', path: '/x' }, { immediate: true });

    const [a, b] = fetched().map((s) => s.events[0]);
    expect(a.eventId).not.toBe(b.eventId);
    expect(typeof a.at).toBe('string');
  });

  it('sends at once when asked, and when the batch is full', () => {
    const tracker = new Tracker({ maxBatch: 3 });
    tracker.enqueue({ type: 'page_view', path: '/' }, { immediate: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i++) tracker.enqueue({ type: 'click', path: '/', section: 's', label: `${i}` });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetched()[1].events).toHaveLength(3);
  });

  it('hands the queue to sendBeacon when the page is hidden or closed', async () => {
    const tracker = new Tracker();
    tracker.enqueue({ type: 'click', path: '/', section: 'nav', label: 'Take' });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    tracker.enqueue({ type: 'click', path: '/', section: 'nav', label: 'Iris' });
    window.dispatchEvent(new Event('pagehide'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await beaconed()).map((s) => s.events[0].label)).toEqual(['Take', 'Iris']);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('ignores becoming visible again', () => {
    const tracker = new Tracker();
    tracker.enqueue({ type: 'click', path: '/', section: 'nav', label: 'Take' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(beaconMock).not.toHaveBeenCalled();
  });

  it('falls back to fetch when the browser refuses the beacon', () => {
    beaconMock.mockReturnValue(false);
    const tracker = new Tracker();
    tracker.enqueue({ type: 'click', path: '/', section: 'nav', label: 'Take' });
    tracker.flush({ beacon: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing with an empty queue', () => {
    new Tracker().flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries a batch once when the network fails, keeping its ids', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    const tracker = new Tracker();
    tracker.enqueue({ type: 'page_view', path: '/' }, { immediate: true });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetched();
    expect(second.events[0].eventId).toBe(first.events[0].eventId);

    // A second failure drops it: nothing more is sent.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries when the server fails, not when it rejects', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    const tracker = new Tracker();
    tracker.enqueue({ type: 'page_view', path: '/' }, { immediate: true });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    tracker.enqueue({ type: 'page_view', path: '/other' }, { immediate: true });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('splits a long queue into requests the hub accepts', () => {
    const tracker = new Tracker({ maxBatch: 1_000 });
    for (let i = 0; i < 120; i++) tracker.enqueue({ type: 'click', path: '/', section: 's', label: `${i}` });
    tracker.flush();
    expect(fetched().map((s) => s.events.length)).toEqual([50, 50, 20]);
  });

  it('counts the path without locale and with the site patterns', () => {
    const tracker = new Tracker({ locales: ['es'], patterns: ['/listings/:id'] });
    expect(tracker.path()).toBe('/precios');
    expect(tracker.path('/es/listings/9')).toBe('/listings/:id');
  });
});

describe('track', () => {
  it('queues a custom event on the current page', async () => {
    getTracker({ locales: ['es'] });
    expect(track('contact_submit', { topic: 'presupuesto' })).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetched()[0].events[0]).toMatchObject({
      type: 'custom',
      name: 'contact_submit',
      props: { topic: 'presupuesto' },
      path: '/precios',
    });
  });

  it('sends a custom event without properties', async () => {
    expect(track('whatsapp_order')).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetched()[0].events[0]).not.toHaveProperty('props');
  });

  it('refuses what the hub would reject, without sending it', async () => {
    expect(track('Contact Submit')).toBe(false);
    expect(track('form_sent', { message: 'x'.repeat(200) })).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps one tracker per page', () => {
    expect(getTracker()).toBe(getTracker());
  });
});
