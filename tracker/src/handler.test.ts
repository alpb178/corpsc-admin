// @vitest-environment node
import { SESSION_COOKIE, VISITOR_COOKIE, createHubTrackHandler } from './handler';

const NOW = Date.parse('2026-09-24T15:00:00.000Z');
const ENV = { HUB_URL: 'https://hub.test/api', HUB_API_KEY: 'secret-key', NODE_ENV: 'production' };
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const EVENT_ID = '0b6f1c1e-3d4a-4c8e-9a52-7a1f0e2b9c11';
const SESSION = 'a'.repeat(32);
const VISITOR = 'b'.repeat(32);

function setup(options: Parameters<typeof createHubTrackHandler>[0] = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
  const POST = createHubTrackHandler({ env: ENV, now: () => NOW, fetch: fetchMock, ...options });
  const forwarded = () =>
    fetchMock.mock.calls.map(([url, init]) => ({
      url,
      headers: (init as RequestInit).headers as Record<string, string>,
      body: JSON.parse((init as RequestInit).body as string) as { schemaVersion: number; events: Array<Record<string, unknown>> },
    }));
  return { POST, fetchMock, forwarded };
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://corpsc.com/api/hub-track', {
    method: 'POST',
    headers: {
      host: 'corpsc.com',
      origin: 'https://corpsc.com',
      'sec-fetch-site': 'same-origin',
      'user-agent': CHROME_ANDROID,
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const pageView = (extra: Record<string, unknown> = {}) => ({
  type: 'page_view',
  eventId: EVENT_ID,
  path: '/',
  at: new Date(NOW - 3_000).toISOString(),
  ...extra,
});

describe('hub-track handler', () => {
  it('forwards the event with visit, visitor, place and device, and never the raw material', async () => {
    const { POST, forwarded } = setup();

    const response = await POST(
      request(
        { events: [pageView({ referrer: 'google.com', utmSource: 'ig', language: 'es', screen: 'sm' })] },
        {
          cookie: `${SESSION_COOKIE}=${SESSION}; ${VISITOR_COOKIE}=${VISITOR}`,
          'x-vercel-ip-country': 'bo',
          'x-vercel-ip-country-region': 'l',
          'x-vercel-ip-city': 'La%20Paz',
        },
      ),
    );

    expect(response.status).toBe(204);
    const [sent] = forwarded();
    expect(sent.url).toBe('https://hub.test/api/ingest/events');
    expect(sent.headers['X-Api-Key']).toBe('secret-key');
    expect(sent.body.schemaVersion).toBe(2);
    expect(sent.body.events[0]).toEqual({
      type: 'page_view',
      eventId: EVENT_ID,
      sessionId: SESSION,
      visitorId: VISITOR,
      country: 'BO',
      region: 'L',
      city: 'La Paz',
      device: 'mobile',
      browser: 'Chrome',
      os: 'Android',
      path: '/',
      referrer: 'google.com',
      utmSource: 'ig',
      language: 'es',
      screen: 'sm',
      at: new Date(NOW - 3_000).toISOString(),
    });
    expect(JSON.stringify(sent.body)).not.toMatch(/203\.0\.113\.7|Mozilla/);
  });

  it('issues both cookies when missing, httpOnly, and renews them on every request', async () => {
    const { POST, forwarded } = setup();

    const response = await POST(request({ events: [pageView()] }));

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=[a-f0-9]{32}; Path=/; Max-Age=1800; HttpOnly; SameSite=Lax; Secure$`));
    expect(cookies[1]).toMatch(new RegExp(`^${VISITOR_COOKIE}=[a-f0-9]{32}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure$`));
    const [{ body }] = forwarded();
    expect(cookies[0]).toContain(body.events[0].sessionId as string);
    expect(cookies[1]).toContain(body.events[0].visitorId as string);
  });

  it('replaces a cookie value it could not have issued', async () => {
    const { POST, forwarded } = setup();

    await POST(request({ events: [pageView()] }, { cookie: `${SESSION_COOKIE}=forged; ${VISITOR_COOKIE}=<script>` }));

    const event = forwarded()[0].body.events[0];
    expect(event.sessionId).toMatch(/^[a-f0-9]{32}$/);
    expect(event.visitorId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('puts each field only on the events it belongs to', async () => {
    const { POST, forwarded } = setup();

    await POST(
      request({
        events: [
          { type: 'click', path: '/', section: 'hero', label: 'Ver', referrer: 'x.com', language: 'es', at: 'bad' },
          { type: 'site_click', path: '/', section: 'projects', label: 'Take', target: 'take' },
          { type: 'custom', path: '/contacto', name: 'contact_submit', props: { topic: 'precio' } },
          { type: 'custom', path: '/contacto', name: 'whatsapp_order' },
        ],
      }),
    );

    const [click, siteClick, custom, bare] = forwarded()[0].body.events;
    expect(click).toMatchObject({ section: 'hero', label: 'Ver', at: new Date(NOW).toISOString() });
    expect(click).not.toHaveProperty('referrer');
    expect(click).not.toHaveProperty('language');
    expect(click).not.toHaveProperty('eventId');
    expect(siteClick).toMatchObject({ target: 'take', linkType: 'web' });
    expect(custom).toMatchObject({ name: 'contact_submit', props: { topic: 'precio' } });
    expect(custom).not.toHaveProperty('section');
    expect(bare).not.toHaveProperty('props');
  });

  it('keeps the browser instant only when plausible', async () => {
    const { POST, forwarded } = setup();
    const ats = [NOW - 20 * 60_000, NOW + 5 * 60_000, NOW + 30_000].map((t) => new Date(t).toISOString());

    await POST(request({ events: ats.map((at) => pageView({ eventId: undefined, at })) }));

    expect(forwarded()[0].body.events.map((e) => e.at)).toEqual([
      new Date(NOW).toISOString(),
      new Date(NOW).toISOString(),
      // A few seconds ahead is a clock slightly off: capped to now.
      new Date(NOW).toISOString(),
    ]);
  });

  it.each([
    ['another site', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }],
    ['another origin without fetch metadata', { origin: 'https://evil.example', 'sec-fetch-site': '' }],
    ['no origin', { origin: '' }],
    ['a malformed origin', { origin: 'not a url', 'sec-fetch-site': '' }],
    ['a crawler', { 'user-agent': 'Googlebot/2.1' }],
    ['no user agent', { 'user-agent': '' }],
  ])('drops a request from %s', async (_case, headers) => {
    const { POST, fetchMock } = setup();
    const response = await POST(request({ events: [pageView()] }, headers));
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts the host a proxy forwards', async () => {
    const { POST, fetchMock } = setup();
    await POST(request({ events: [pageView()] }, { host: 'internal:3000', 'x-forwarded-host': 'corpsc.com' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['not JSON', '{nope'],
    ['no events', { events: 'x' }],
    ['a null body', 'null'],
    ['an oversized body', { events: [pageView({ label: 'x'.repeat(70_000) })] }],
  ])('drops %s', async (_case, body) => {
    const { POST, fetchMock } = setup();
    expect((await POST(request(body))).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown type', { type: 'scroll', path: '/' }],
    ['no path', { type: 'page_view' }],
    ['an id that is not a UUID', { type: 'page_view', path: '/', eventId: '123' }],
    ['a site click without target', { type: 'site_click', path: '/', section: 's', label: 'l' }],
    ['a click without label', { type: 'click', path: '/', section: 's' }],
    ['an overlong section', { type: 'site_click', path: '/', target: 't', section: 'x'.repeat(65) }],
    ['an overlong label', { type: 'site_click', path: '/', target: 't', label: 'x'.repeat(121) }],
    ['a custom event without a valid name', { type: 'custom', path: '/', name: 'Bad Name' }],
    ['properties the hub rejects', { type: 'custom', path: '/', name: 'ok_name', props: { a: { b: 1 } } }],
    ['a full referring URL', { type: 'page_view', path: '/', referrer: 'https://google.com/search?q=x' }],
    ['an overlong utm', { type: 'page_view', path: '/', utmCampaign: 'x'.repeat(101) }],
    ['an unknown link type', { type: 'site_click', path: '/', target: 't', linkType: 'fax' }],
    ['a language with region', { type: 'page_view', path: '/', language: 'es-BO' }],
    ['a screen in pixels', { type: 'page_view', path: '/', screen: '1440' }],
    ['something that is not an object', 'page_view'],
  ])('filters out %s and keeps the rest', async (_case, bad) => {
    const { POST, forwarded } = setup();
    await POST(request({ events: [bad, pageView()] }));
    expect(forwarded()[0].body.events).toHaveLength(1);
  });

  it('caps a request at the hub limit', async () => {
    const { POST, forwarded } = setup();
    await POST(request({ events: Array.from({ length: 70 }, () => pageView({ eventId: undefined })) }));
    expect(forwarded()[0].body.events).toHaveLength(50);
  });

  it('caps what one address sends per minute', async () => {
    let now = NOW;
    const { POST, fetchMock } = setup({ eventsPerMinute: 3, now: () => now });
    const two = { events: [pageView({ eventId: undefined }), pageView({ eventId: undefined })] };

    await POST(request(two));
    await POST(request(two));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Another address is counted apart.
    await POST(request(two, { 'x-forwarded-for': '198.51.100.1' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A minute later the window starts again.
    now += 60_000;
    await POST(request(two));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('counts addresses without a forwarded header too', async () => {
    const { POST, fetchMock } = setup({ eventsPerMinute: 1 });
    await POST(request({ events: [pageView()] }, { 'x-forwarded-for': '', 'x-real-ip': '192.0.2.1' }));
    await POST(request({ events: [pageView()] }, { 'x-forwarded-for': '', 'x-real-ip': '192.0.2.1' }));
    await POST(request({ events: [pageView()] }, { 'x-forwarded-for': '' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forgets closed windows when many addresses have been seen', async () => {
    let now = NOW;
    const { POST, fetchMock } = setup({ eventsPerMinute: 1, now: () => now });
    for (let i = 0; i <= 10_001; i++) {
      await POST(request('{nope', { 'x-forwarded-for': `10.0.${i >> 8}.${i & 255}` }));
    }
    now += 60_000;
    await POST(request({ events: [pageView()] }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sets the cookies but forwards nothing without hub configuration', async () => {
    const { POST, fetchMock } = setup({ env: { NODE_ENV: 'development' } });
    const response = await POST(request({ events: [pageView()] }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.getSetCookie()[0]).not.toContain('Secure');
  });

  it("answers before calling the hub when given Next's after()", async () => {
    const tasks: Array<() => Promise<void>> = [];
    const { POST, fetchMock } = setup({ after: (task) => void tasks.push(task) });

    await POST(request({ events: [pageView()] }));
    expect(fetchMock).not.toHaveBeenCalled();

    await tasks[0]();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the hub is down', async () => {
    const { POST, fetchMock } = setup();
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect((await POST(request({ events: [pageView()] }))).status).toBe(204);
  });

  it('bounds the wait for the hub without after()', async () => {
    const { POST, fetchMock } = setup({ forwardTimeoutMs: 1_500 });
    await POST(request({ events: [pageView()] }));
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('drops a city Vercel encoded badly or too long, and a malformed country', async () => {
    const { POST, forwarded } = setup();
    await POST(request({ events: [pageView()] }, { 'x-vercel-ip-city': '%E0%A4%A', 'x-vercel-ip-country': 'BOL' }));
    await POST(request({ events: [pageView()] }, { 'x-vercel-ip-city': 'x'.repeat(101) }));
    for (const { body } of forwarded()) {
      expect(body.events[0]).not.toHaveProperty('city');
      expect(body.events[0]).not.toHaveProperty('country');
    }
  });

  it('survives a body that cannot be read', async () => {
    const { POST, fetchMock } = setup();
    const broken = request({ events: [pageView()] });
    vi.spyOn(broken, 'text').mockRejectedValue(new Error('aborted'));
    expect((await POST(broken)).status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('works with its defaults', async () => {
    const POST = createHubTrackHandler();
    expect((await POST(request({ events: [pageView()] }))).status).toBe(204);
  });
});
