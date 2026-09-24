/**
 * Where this visit came from, read once, on the page the visitor lands on.
 *
 * Only the referring DOMAIN leaves the browser, never the full URL: a search
 * results page or a shared link can carry the visitor's query or an id. The
 * country is not read here — the site's server adds it from its host's header.
 */

export interface VisitOrigin {
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

const MAX_UTM = 100;

export function visitOrigin(): VisitOrigin {
  const origin: VisitOrigin = {};

  try {
    if (document.referrer) {
      // `hostname`, not `host`: a port would make the hub reject the domain.
      const host = new URL(document.referrer).hostname.toLowerCase();
      const own = window.location.hostname.toLowerCase();
      // Coming from our own pages is navigation, not a source.
      if (host && withoutWww(host) !== withoutWww(own)) origin.referrer = host;
    }
  } catch {
    // A referrer that is not a URL says nothing useful.
  }

  const params = new URLSearchParams(window.location.search);
  const utm = (name: string) => params.get(name)?.trim().slice(0, MAX_UTM) || undefined;
  origin.utmSource = utm('utm_source');
  origin.utmMedium = utm('utm_medium');
  origin.utmCampaign = utm('utm_campaign');

  return origin;
}

function withoutWww(host: string): string {
  return host.replace(/^www\./, '');
}
