import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { HubAnalytics } from './HubAnalytics';
import { resetTrackerForTests } from './client';

let pathname = '/es';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

type Sent = { events: Array<Record<string, unknown>> };
let fetchMock: ReturnType<typeof vi.fn>;
const sent = () => fetchMock.mock.calls.flatMap(([, init]) => (JSON.parse((init as RequestInit).body as string) as Sent).events);

beforeEach(() => {
  vi.useFakeTimers();
  resetTrackerForTests();
  pathname = '/es';
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState(null, '', '/es?utm_source=instagram');
  Object.defineProperty(document, 'referrer', { value: 'https://l.instagram.com/', configurable: true });
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HubAnalytics', () => {
  it('sends the landing page view at once, once, with its origin', () => {
    render(
      <StrictMode>
        <HubAnalytics locales={['es']} />
      </StrictMode>,
    );

    const views = sent().filter((e) => e.type === 'page_view');
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      path: '/',
      referrer: 'l.instagram.com',
      utmSource: 'instagram',
      language: expect.stringMatching(/^[a-z]{2}$/),
      screen: expect.any(String),
    });
  });

  it('queues later navigations, without the origin again', async () => {
    const { rerender } = render(<HubAnalytics locales={['es']} pathPatterns={['/listings/:id']} />);
    pathname = '/es/listings/42';
    rerender(<HubAnalytics locales={['es']} pathPatterns={['/listings/:id']} />);

    expect(sent()).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    const second = sent()[1];
    expect(second).toMatchObject({ type: 'page_view', path: '/listings/:id' });
    expect(second).not.toHaveProperty('referrer');
  });

  it('counts clicks with where they happened, and outbound ones with their site', async () => {
    document.body.innerHTML =
      '<section data-track-section="projects"><a id="out" href="https://take.corpsc.com/">Take</a><button id="in">Ver más</button></section>';
    render(<HubAnalytics />);

    document.getElementById('out')!.addEventListener('click', (e) => e.preventDefault());
    document.getElementById('out')!.click();
    document.getElementById('in')!.click();
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    const clicks = sent().filter((e) => e.type !== 'page_view');
    expect(clicks).toEqual([
      expect.objectContaining({ type: 'site_click', section: 'projects', label: 'Take', target: 'take', linkType: 'web' }),
      expect.objectContaining({ type: 'click', section: 'projects', label: 'Ver más' }),
    ]);
  });

  it('keeps screen text out of private areas', async () => {
    pathname = '/es/account';
    document.body.innerHTML = '<main><button id="b">Ana Pérez</button></main>';
    render(<HubAnalytics privateSegments={['account']} />);

    document.getElementById('b')!.click();
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(sent().find((e) => e.type === 'click')).toMatchObject({ label: 'button' });
  });

  it('uses the store links and endpoint the site passes', async () => {
    document.body.innerHTML = '<a id="ios" href="https://apps.apple.com/app/take/id1">App Store</a>';
    render(
      <HubAnalytics
        endpoint="/api/track"
        storeLinks={{ 'https://apps.apple.com/app/take/id1': { slug: 'take', linkType: 'ios' } }}
      />,
    );

    document.getElementById('ios')!.addEventListener('click', (e) => e.preventDefault());
    document.getElementById('ios')!.click();
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(fetchMock.mock.calls.every(([url]) => url === '/api/track')).toBe(true);
    expect(sent().find((e) => e.type === 'site_click')).toMatchObject({ target: 'take', linkType: 'ios' });
  });

  it('stops listening when unmounted', async () => {
    document.body.innerHTML = '<button id="b">Ver</button>';
    const { unmount } = render(<HubAnalytics />);
    unmount();

    document.getElementById('b')!.click();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(sent().filter((e) => e.type === 'click')).toHaveLength(0);
  });

  it('ignores clicks on nothing clickable, and leaves out a language it cannot read', async () => {
    Object.defineProperty(navigator, 'language', { value: '', configurable: true });
    document.body.innerHTML = '<p id="p">Texto</p>';
    render(<HubAnalytics />);

    document.getElementById('p')!.click();
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(sent()).toHaveLength(1);
    expect(sent()[0].language).toBeUndefined();
    Object.defineProperty(navigator, 'language', { value: 'es-BO', configurable: true });
  });

  it('sends nothing without a path', () => {
    pathname = null as unknown as string;
    render(<HubAnalytics />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
