import { randomUUID } from 'node:crypto';
import {
  EVENT_NAME,
  MAX_EVENTS,
  SCHEMA_VERSION,
  SCREENS,
  isValidProps,
  type BrowserEvent,
} from './contract';
import { parseUserAgent } from './user-agent';

/**
 * The site's `/api/hub-track`: collects what the page sends and forwards it
 * to the group's hub.
 *
 * It exists because **the hub key must never reach the browser**: whoever
 * holds it can write metrics for this project. So the page writes to its own
 * origin and the key is added here, on the server. Along the way this route
 * adds what only the server knows —the visit and visitor cookies, the place
 * the hosting resolved from the IP, the device from the user agent— and
 * forwards none of the raw material: no IP, no user agent.
 *
 *   // app/api/hub-track/route.ts
 *   import { after } from 'next/server';
 *   import { createHubTrackHandler } from '@/lib/hub-tracker/handler';
 *   export const POST = createHubTrackHandler({ after });
 *
 * Environment (without it nothing is forwarded, which is what local and
 * preview deployments want): HUB_URL, HUB_API_KEY.
 */

export interface HandlerOptions {
  /**
   * Next's `after()` (Next ≥ 15.1): the response goes out at once and the hub
   * is called afterwards. Without it —Next 14— the route waits for the hub,
   * but never longer than `forwardTimeoutMs`.
   */
  after?: (task: () => Promise<void>) => void;
  forwardTimeoutMs?: number;
  /** Events one address may send per minute before the rest are dropped. */
  eventsPerMinute?: number;
  env?: Record<string, string | undefined>;
  now?: () => number;
  fetch?: typeof fetch;
}

/**
 * The visit: half an hour of inactivity closes it, the usual session window.
 * The visitor: a year, so a browser that comes back is recognised. Both hold
 * a random id and nothing else, and both are httpOnly: no script on the page
 * can read them, so a third-party snippet can't steal or forge them.
 */
export const SESSION_COOKIE = 'hub_v';
export const VISITOR_COOKIE = 'hub_vid';
const SESSION_SECONDS = 30 * 60;
const VISITOR_SECONDS = 365 * 24 * 3600;

/**
 * Crawlers announce themselves and there's no reason to count them as people.
 * Deliberately coarse: what slips through is a rounding error, and what it
 * would over-block is a reader.
 */
const BOT = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|monitor|pingdom|curl|wget|python-requests|axios|node-fetch/i;

/** Events wait in the page's queue a few seconds; older or future ones are clamped. */
const MAX_CLIENT_SKEW_MS = 10 * 60_000;
const MAX_BODY_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[a-f0-9]{32}$/;

type Incoming = Partial<Record<keyof BrowserEvent, unknown>>;

export function createHubTrackHandler(options: HandlerOptions = {}) {
  const {
    after,
    forwardTimeoutMs = 1_500,
    eventsPerMinute = 300,
    env = process.env,
    now = Date.now,
    fetch: send = fetch,
  } = options;
  const limiter = new RateLimiter(eventsPerMinute, now);

  return async function POST(request: Request): Promise<Response> {
    // 204 for everything, always. For the page this is fire and forget: a
    // tracking problem must never look like a broken site, and telling a
    // caller why its payload was dropped only helps someone probing it.
    const headers = new Headers();
    const done = () => new Response(null, { status: 204, headers });

    if (!isSameOrigin(request)) return done();

    const ua = request.headers.get('user-agent') ?? '';
    if (!ua || BOT.test(ua)) return done();

    const events = await readEvents(request);
    if (events.length === 0) return done();

    // The address is only used here, in memory, to cap one sender's volume.
    if (!limiter.allow(clientAddress(request), events.length)) return done();

    const cookies = parseCookies(request.headers.get('cookie'));
    const sessionId = validId(cookies[SESSION_COOKIE]) ?? newId();
    const visitorId = validId(cookies[VISITOR_COOKIE]) ?? newId();
    const secure = env.NODE_ENV === 'production';
    // Renewed with every request, so the visit ends after half an hour of
    // silence and not half an hour after it started.
    headers.append('Set-Cookie', cookie(SESSION_COOKIE, sessionId, SESSION_SECONDS, secure));
    headers.append('Set-Cookie', cookie(VISITOR_COOKIE, visitorId, VISITOR_SECONDS, secure));

    const hubUrl = env.HUB_URL;
    const apiKey = env.HUB_API_KEY;
    if (!hubUrl || !apiKey) return done();

    const context = {
      sessionId,
      visitorId,
      ...placeOf(request),
      ...parseUserAgent(ua),
    };
    const at = now();
    const body = JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      events: events.map((event) => toHub(event, context, at)),
    });

    const forward = async () => {
      try {
        await send(`${hubUrl}/ingest/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
          body,
          cache: 'no-store',
          signal: AbortSignal.timeout(after ? 10_000 : forwardTimeoutMs),
        });
      } catch {
        // The hub being down isn't the visitor's problem. The event is dropped
        // on purpose: queueing it would need storage this site doesn't have.
      }
    };

    if (after) after(forward);
    else await forward();
    return done();
  };
}

/**
 * The page posts to its own origin. A browser always says where a POST comes
 * from; a request from another site, or one that doesn't say, isn't the page.
 * It doesn't stop someone forging headers with curl —the rate limit is for
 * that— but it stops any other website from filling our numbers.
 */
function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readEvents(request: Request): Promise<Incoming[]> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return [];
  }
  if (text.length > MAX_BODY_BYTES) return [];

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return [];
  }
  const events = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.filter(isValid).slice(0, MAX_EVENTS);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** The hub's limits, checked here so a bad event doesn't cost a round trip. */
function isValid(event: unknown): event is Incoming {
  if (typeof event !== 'object' || event === null) return false;
  const e = event as Incoming;

  if (e.type !== 'page_view' && e.type !== 'click' && e.type !== 'site_click' && e.type !== 'custom') return false;
  if (!isText(e.path, 512)) return false;
  if (e.eventId !== undefined && !(typeof e.eventId === 'string' && UUID.test(e.eventId))) return false;
  if (e.type === 'site_click' && !isText(e.target, 64)) return false;
  // A click must say where it happened.
  if (e.type === 'click' && (!isText(e.section, 64) || !isText(e.label, 120))) return false;
  if (e.section !== undefined && !isText(e.section, 64)) return false;
  if (e.label !== undefined && !isText(e.label, 120)) return false;
  if (e.type === 'custom' && !(typeof e.name === 'string' && EVENT_NAME.test(e.name))) return false;
  if (e.props !== undefined && !isValidProps(e.props)) return false;
  // Only the domain: a full URL could carry the visitor's search or an id.
  if (e.referrer !== undefined && !(typeof e.referrer === 'string' && /^[a-z0-9.-]{1,255}$/.test(e.referrer))) {
    return false;
  }
  for (const utm of [e.utmSource, e.utmMedium, e.utmCampaign]) {
    if (utm !== undefined && !isText(utm, 100)) return false;
  }
  if (e.linkType !== undefined && !['web', 'android', 'ios'].includes(e.linkType as string)) return false;
  if (e.language !== undefined && !(typeof e.language === 'string' && /^[a-z]{2}$/.test(e.language))) return false;
  if (e.screen !== undefined && !SCREENS.includes(e.screen as (typeof SCREENS)[number])) return false;
  return true;
}

interface Context {
  sessionId: string;
  visitorId: string;
  country?: string;
  region?: string;
  city?: string;
  device: string;
  browser: string;
  os: string;
}

/** The event as the hub's contract v2 wants it: each field only where it belongs. */
function toHub(event: Incoming, context: Context, now: number) {
  const type = event.type as BrowserEvent['type'];
  const isClick = type === 'click' || type === 'site_click';

  return {
    type,
    ...(typeof event.eventId === 'string' ? { eventId: event.eventId.toLowerCase() } : {}),
    ...context,
    path: event.path,
    ...(type === 'page_view'
      ? {
          referrer: event.referrer,
          utmSource: event.utmSource,
          utmMedium: event.utmMedium,
          utmCampaign: event.utmCampaign,
          language: event.language,
          screen: event.screen,
        }
      : {}),
    ...(isClick && event.section && event.label ? { section: event.section, label: event.label } : {}),
    ...(type === 'site_click' ? { target: event.target, linkType: event.linkType ?? 'web' } : {}),
    ...(type === 'custom' ? { name: event.name, ...(event.props ? { props: event.props } : {}) } : {}),
    at: new Date(clampInstant(event.at, now)).toISOString(),
  };
}

/** The browser's instant if it's plausible; otherwise, now. */
function clampInstant(at: unknown, now: number): number {
  const declared = typeof at === 'string' ? Date.parse(at) : Number.NaN;
  if (Number.isNaN(declared) || declared > now + 60_000 || declared < now - MAX_CLIENT_SKEW_MS) return now;
  return Math.min(declared, now);
}

/**
 * Country, region and city as the site's hosting resolved them from the IP.
 * On Vercel: `x-vercel-ip-*`. The IP itself never leaves this server.
 */
function placeOf(request: Request): { country?: string; region?: string; city?: string } {
  const country = request.headers.get('x-vercel-ip-country')?.toUpperCase();
  const region = request.headers.get('x-vercel-ip-country-region')?.toUpperCase();
  let city = request.headers.get('x-vercel-ip-city') ?? undefined;
  try {
    // Vercel sends it URL-encoded: "S%C3%A3o%20Paulo".
    city = city ? decodeURIComponent(city).trim() : undefined;
  } catch {
    city = undefined;
  }

  return {
    ...(country && /^[A-Z]{2}$/.test(country) ? { country } : {}),
    ...(region && /^[A-Z0-9]{1,8}$/.test(region) ? { region } : {}),
    ...(city && city.length <= 100 ? { city } : {}),
  };
}

function clientAddress(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

/** Only an id this route could have issued; anything else is replaced. */
function validId(value: string | undefined): string | undefined {
  return value && ID.test(value) ? value : undefined;
}

function newId(): string {
  return randomUUID().replace(/-/g, '');
}

function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Fixed-window counter per address, in memory. On serverless each instance
 * counts on its own, which is enough to stop one sender flooding the hub.
 */
class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly now: () => number,
  ) {}

  allow(key: string, events: number): boolean {
    const t = this.now();
    // Forget closed windows before the map grows without bound.
    if (this.windows.size > 10_000) {
      for (const [k, w] of this.windows) if (t - w.start >= 60_000) this.windows.delete(k);
    }

    const current = this.windows.get(key);
    if (!current || t - current.start >= 60_000) {
      this.windows.set(key, { start: t, count: events });
      return events <= this.limit;
    }
    current.count += events;
    return current.count <= this.limit;
  }
}
