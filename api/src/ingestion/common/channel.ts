/**
 * Where a visit came from, from what its landing page view carried: the
 * referring domain and the `utm_*` parameters.
 *
 * The channel names are the ones the panel already translates
 * (web/src/lib/format.ts), which are GA4's default channel groups, so a site
 * that pushes GA-style channels and one that sends events read the same.
 */

export const DIRECT = '__direct__';

export interface VisitOrigin {
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
}

const SEARCH = ['google', 'bing', 'duckduckgo', 'yahoo', 'yandex', 'ecosia', 'baidu', 'brave', 'startpage'];
const SOCIAL = [
  'facebook',
  'instagram',
  't.co',
  'twitter',
  'x.com',
  'linkedin',
  'lnkd.in',
  'tiktok',
  'pinterest',
  'reddit',
  'whatsapp',
  'wa.me',
  'telegram',
  't.me',
  'threads',
  'snapchat',
];
const VIDEO = ['youtube', 'youtu.be', 'vimeo', 'twitch'];
const EMAIL = ['mail.google', 'outlook', 'mail.yahoo', 'email', 'newsletter'];

const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsearch|paid_search|paid-search|cpm|cpv|paidsocial|paid_social|paid-social|ads?)$/;

/**
 * `google` matches any domain with that label (google.com, google.com.bo) and
 * a bare `utm_source=google`; a dotted name (`t.co`, `mail.google`) matches
 * that domain, its subdomains, or a domain that starts with it.
 */
function matches(value: string | null, names: string[]): boolean {
  if (!value) return false;
  return names.some((name) =>
    name.includes('.')
      ? value === name || value.endsWith(`.${name}`) || value.startsWith(`${name}.`)
      : value.split('.').includes(name),
  );
}

/** The source as the panel lists it: the campaign's source, else the domain. */
export function sourceOf(origin: VisitOrigin): string {
  return origin.utmSource ?? origin.referrer ?? DIRECT;
}

export function channelOf(origin: VisitOrigin): string {
  const source = origin.utmSource ?? origin.referrer;
  const medium = origin.utmMedium;

  const isSearch = matches(source, SEARCH);
  const isSocial = matches(source, SOCIAL);
  const isVideo = matches(source, VIDEO);

  if (medium && PAID_MEDIUMS.test(medium)) {
    if (isSearch) return 'Paid Search';
    if (isSocial) return 'Paid Social';
    if (isVideo) return 'Paid Video';
    return 'Display';
  }
  if (medium === 'email' || matches(source, EMAIL)) return 'Email';
  if (medium === 'affiliate' || medium === 'affiliates') return 'Affiliates';
  if (isSearch || medium === 'organic') return 'Organic Search';
  if (isVideo) return 'Organic Video';
  if (isSocial || medium === 'social') return 'Organic Social';
  if (source) return 'Referral';
  return 'Direct';
}
