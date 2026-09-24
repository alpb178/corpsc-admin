import type { LinkType } from './contract';

/**
 * The group's sites, by domain, with the slug the hub stores their clicks
 * under.
 *
 * The canonical registry is `api/prisma/seed.ts` in corpsc-hub: a different
 * slug here ("irisnatural" instead of "iris-natural") would split one site's
 * clicks into two buckets nobody reconciles. Domains without "www.": it's the
 * same site.
 */
export const GROUP_SITES: Readonly<Record<string, string>> = {
  'corpsc.com': 'corpsc',
  'take.corpsc.com': 'take',
  'invoices.corpsc.com': 'invoices',
  'irisnatural.corpsc.com': 'iris-natural',
  'tu-chamba.corpsc.com': 'tu-chamba',
};

export interface OutboundTarget {
  slug: string;
  linkType: LinkType;
}

/**
 * App-store links, by exact URL. Every iOS app lives under apps.apple.com, so
 * the host alone would merge different projects into one.
 */
export type StoreLinks = Readonly<Record<string, OutboundTarget>>;

/**
 * Which group site a link goes to, or `null` for anything else: an anchor, a
 * mailto, another website, this very site.
 *
 * Resolved WITHOUT a base URL on purpose: with one, a relative link —`/es`—
 * would resolve against this site and count as a click leaving for ourselves.
 */
export function resolveTarget(
  href: string,
  ownHost: string,
  sites: Readonly<Record<string, string>> = GROUP_SITES,
  storeLinks: StoreLinks = {},
): OutboundTarget | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const store = storeLinks[url.href];
  if (store) return store;

  const host = url.hostname.replace(/^www\./, '');
  if (host === ownHost.replace(/^www\./, '').replace(/:\d+$/, '')) return null;

  const slug = sites[host];
  return slug ? { slug, linkType: 'web' } : null;
}
