/**
 * What travels from the page to the site's `/api/hub-track`, and the limits
 * both sides share with the hub.
 *
 * Contract with the hub: corpsc-hub/docs/envio-de-metricas/eventos.md.
 * The hub validates everything again: these limits exist here so a bad event
 * is dropped on the site instead of costing a round trip to be rejected.
 */

export const SCHEMA_VERSION = 2;

/** Per request, the same cap the hub applies. */
export const MAX_EVENTS = 50;

export type EventType = 'page_view' | 'click' | 'site_click' | 'custom';
export type LinkType = 'web' | 'android' | 'ios';
export type Props = Record<string, string | number | boolean>;

export const SCREENS = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const;
export type Screen = (typeof SCREENS)[number];

/** A custom event's name: snake_case, the same rule as the hub's. */
export const EVENT_NAME = /^[a-z][a-z0-9_]{1,63}$/;
export const MAX_PROPS = 10;
export const MAX_PROPS_BYTES = 1024;
export const MAX_PROP_TEXT = 100;
const PROP_KEY = /^[a-z][a-z0-9_]{0,31}$/;

/** An event as the page sends it. The server adds session, visitor, place and device. */
export interface BrowserEvent {
  type: EventType;
  /** UUID: a beacon sent twice is stored once. */
  eventId: string;
  path: string;
  /** When it happened in the browser; events wait a few seconds in the queue. */
  at: string;

  // Landing page view only.
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;

  // Page views.
  language?: string;
  screen?: Screen;

  // Clicks.
  section?: string;
  label?: string;
  target?: string;
  linkType?: LinkType;

  // Custom events.
  name?: string;
  props?: Props;
}

/**
 * Viewport width in buckets, so the screen says something useful without
 * becoming a fingerprint: xs < 576 ≤ sm < 768 ≤ md < 992 ≤ lg < 1200 ≤ xl
 * < 1440 ≤ xxl.
 */
export function screenBucket(width: number): Screen {
  if (width < 576) return 'xs';
  if (width < 768) return 'sm';
  if (width < 992) return 'md';
  if (width < 1200) return 'lg';
  if (width < 1440) return 'xl';
  return 'xxl';
}

/** True if a custom event's properties are something the hub will accept. */
export function isValidProps(props: unknown): props is Props {
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return false;
  const entries = Object.entries(props);
  if (entries.length > MAX_PROPS) return false;

  for (const [key, value] of entries) {
    if (!PROP_KEY.test(key)) return false;
    const ok =
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= MAX_PROP_TEXT);
    if (!ok) return false;
  }
  return new TextEncoder().encode(JSON.stringify(props)).length <= MAX_PROPS_BYTES;
}

/** A UUID v4, with a fallback for browsers without `crypto.randomUUID`. */
export function newEventId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
