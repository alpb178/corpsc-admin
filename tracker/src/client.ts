import {
  EVENT_NAME,
  MAX_EVENTS,
  isValidProps,
  newEventId,
  type BrowserEvent,
  type Props,
} from './contract';
import { normalizePath, type PathOptions } from './path';

/**
 * The browser side of the tracker: a small queue that sends events to the
 * site's own `/api/hub-track` in batches.
 *
 * Fast: nothing runs before the page is interactive (the component mounts in
 * an effect) and a batch is one request instead of one per click.
 * Silent: every failure is swallowed; analytics never breaks a page.
 * Resilient: when the page is hidden or closed the queue goes out with
 * `sendBeacon`, which the browser delivers after the page is gone, and a
 * batch that fails to send is retried once.
 */

export interface TrackerOptions extends PathOptions {
  /** The site's collecting route. */
  endpoint?: string;
  /** How long an event may wait for company before the queue is sent. */
  flushIntervalMs?: number;
  /** Past this size the queue is sent right away. */
  maxBatch?: number;
}

type Draft = Omit<BrowserEvent, 'eventId' | 'at'>;

const DEFAULTS = { endpoint: '/api/hub-track', flushIntervalMs: 5_000, maxBatch: 20 };

export class Tracker {
  private queue: BrowserEvent[] = [];
  /** Batches already retried once: a second failure drops them. */
  private readonly retried = new WeakSet<BrowserEvent>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private options: Required<Pick<TrackerOptions, 'endpoint' | 'flushIntervalMs' | 'maxBatch'>> & PathOptions;

  constructor(options: TrackerOptions = {}) {
    this.options = { ...DEFAULTS, ...options };

    // The page can go away at any moment after a click: `hidden` is the last
    // moment a mobile browser reliably runs our code, `pagehide` covers the
    // desktop ones that skip it.
    const leave = () => this.flush({ beacon: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') leave();
    });
    window.addEventListener('pagehide', leave);
  }

  /** Later options (a site's locales, its patterns) apply from now on. */
  configure(options: TrackerOptions): void {
    this.options = { ...this.options, ...options };
  }

  /** The path of the current page, as the hub will count it. */
  path(raw: string = window.location.pathname): string {
    return normalizePath(raw, this.options);
  }

  /**
   * Queues an event. `immediate` sends the queue now: the landing page view
   * goes at once, because its response is what sets the visit's cookie.
   */
  enqueue(draft: Draft, { immediate = false }: { immediate?: boolean } = {}): void {
    this.queue.push({ ...draft, eventId: newEventId(), at: new Date().toISOString() });

    if (immediate || this.queue.length >= this.options.maxBatch) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.options.flushIntervalMs);
    }
  }

  /**
   * A custom event: a form sent, an order through WhatsApp. Returns false,
   * without sending anything, if the name or the properties would be rejected.
   */
  track(name: string, props?: Props): boolean {
    if (!EVENT_NAME.test(name)) return false;
    if (props !== undefined && !isValidProps(props)) return false;
    this.enqueue({ type: 'custom', path: this.path(), name, ...(props ? { props } : {}) });
    return true;
  }

  flush({ beacon = false }: { beacon?: boolean } = {}): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.queue.length > 0) {
      this.send(this.queue.splice(0, MAX_EVENTS), beacon);
    }
  }

  private send(batch: BrowserEvent[], beacon: boolean): void {
    const body = JSON.stringify({ events: batch });

    if (beacon && typeof navigator.sendBeacon === 'function') {
      // `false` means the browser refused to queue it (too big, or a quota):
      // then it's worth trying the normal way.
      if (navigator.sendBeacon(this.options.endpoint, new Blob([body], { type: 'application/json' }))) return;
    }

    fetch(this.options.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // Survives the navigation that a click often triggers.
      keepalive: true,
    }).then(
      (response) => {
        // Only the server being down is worth retrying; a 4xx won't change.
        if (response.status >= 500) this.retry(batch);
      },
      () => this.retry(batch),
    );
  }

  private retry(batch: BrowserEvent[]): void {
    const fresh = batch.filter((event) => !this.retried.has(event));
    if (fresh.length === 0) return;
    for (const event of fresh) this.retried.add(event);
    // Back in the queue with the same eventId: if the first attempt did arrive
    // after all, the hub drops the copy.
    this.queue.unshift(...fresh);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.options.flushIntervalMs);
  }
}

let shared: Tracker | null = null;

/**
 * The page's tracker. One per page: StrictMode mounts components twice, and
 * two queues would register their listeners twice and send twice.
 */
export function getTracker(options?: TrackerOptions): Tracker {
  if (!shared) shared = new Tracker(options);
  else if (options) shared.configure(options);
  return shared;
}

/**
 * Sends a custom event from anywhere in the site:
 *
 *   track('contact_submit', { topic: 'presupuesto' })
 *
 * Name in snake_case; properties are for segmenting (up to 10 keys, short
 * text, numbers or booleans), never what someone typed in a form.
 */
export function track(name: string, props?: Props): boolean {
  if (typeof window === 'undefined') return false;
  return getTracker().track(name, props);
}

/** For tests only: forget the page's tracker. */
export function resetTrackerForTests(): void {
  shared = null;
}
