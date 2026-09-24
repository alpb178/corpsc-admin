'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getTracker } from './client';
import { screenBucket } from './contract';
import { describeClick, isPrivatePath } from './click-target';
import { GROUP_SITES, resolveTarget, type StoreLinks } from './group-sites';
import { visitOrigin } from './visit-origin';

export interface HubAnalyticsProps {
  /** Path segments whose screen text must not leave the site: `['admin', 'account']`. */
  privateSegments?: readonly string[];
  /** Locale prefixes the path is counted without: `['es', 'en', 'pt']`. */
  locales?: readonly string[];
  /** Routes with ids, counted as one page: `['/listings/:id']`. */
  pathPatterns?: readonly string[];
  /** Group sites by domain. Defaults to the hub's registry. */
  groupSites?: Readonly<Record<string, string>>;
  /** App-store links by exact URL, for sites that link to the group's apps. */
  storeLinks?: StoreLinks;
  endpoint?: string;
}

/**
 * Sends the hub a page view per route and one event per click on a link or
 * button, saying where on the page it happened. Clicks that leave for a
 * sibling site go as `site_click`, with their destination.
 *
 * Mount it once, in the root layout. Everything goes through the site's own
 * `/api/hub-track`, which holds the key: in the browser it would be public.
 *
 * Clicks are listened for on the document instead of link by link, so a card
 * or a button added tomorrow is counted without anyone attaching a handler.
 * Every prop is plain data so a server layout can pass it.
 */
export function HubAnalytics({
  privateSegments = [],
  locales = [],
  pathPatterns = [],
  groupSites = GROUP_SITES,
  storeLinks = {},
  endpoint,
}: HubAnalyticsProps) {
  const pathname = usePathname();
  // The options are plain data the site fixes once. Arrays are new objects on
  // every render, so the effects depend on their serialized form instead:
  // stable while the content doesn't change.
  const config = JSON.stringify({ privateSegments, locales, pathPatterns, groupSites, storeLinks, endpoint });
  // Last path sent: StrictMode runs effects twice, and a remount would repeat it.
  const lastPath = useRef<string | null>(null);
  // Only the first page view of this load carries the source: later
  // client-side navigations keep the same document.referrer.
  const landed = useRef(false);

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;

    const { locales, pathPatterns, endpoint } = JSON.parse(config) as Config;
    const tracker = getTracker({ locales, patterns: pathPatterns, ...(endpoint ? { endpoint } : {}) });
    const landing = !landed.current;
    landed.current = true;

    tracker.enqueue(
      {
        type: 'page_view',
        path: tracker.path(pathname),
        ...(landing ? visitOrigin() : {}),
        language: primaryLanguage(),
        screen: screenBucket(window.innerWidth),
      },
      // The landing goes at once: its response sets the visit's cookie.
      { immediate: landing },
    );
  }, [pathname, config]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const { privateSegments, groupSites, storeLinks } = JSON.parse(config) as Config;
      const tracker = getTracker();
      const raw = pathname ?? '/';
      const click = describeClick(event.target, isPrivatePath(raw, privateSegments));
      if (!click) return;

      const { section, label } = click;
      const path = tracker.path(raw);
      const anchor = click.element.closest('a[href]');
      const target =
        anchor instanceof HTMLAnchorElement
          ? resolveTarget(anchor.href, window.location.host, groupSites, storeLinks)
          : null;

      tracker.enqueue(
        target
          ? { type: 'site_click', path, section, label, target: target.slug, linkType: target.linkType }
          : { type: 'click', path, section, label },
      );
    }

    // Capture phase: the click counts even if something below stops propagation.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname, config]);

  return null;
}

type Config = Required<Omit<HubAnalyticsProps, 'endpoint'>> & Pick<HubAnalyticsProps, 'endpoint'>;

/** `es-BO` → `es`. Undefined if the browser doesn't say. */
function primaryLanguage(): string | undefined {
  const lang = navigator.language?.slice(0, 2).toLowerCase();
  return lang && /^[a-z]{2}$/.test(lang) ? lang : undefined;
}
