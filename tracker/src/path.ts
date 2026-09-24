/**
 * The path as the hub should count it.
 *
 * Two things split one page into many rows in the panel: the language prefix
 * (`/es/precios`, `/en/precios`, `/pt/precios` are the same page read in three
 * languages) and ids in the URL (`/listings/812`, `/listings/813`… are one
 * kind of page, and a thousand of them would push every other page out of the
 * top-100). Each site declares its locales and its patterns; nothing is
 * guessed, so a path the site didn't describe is left as it is.
 */

export interface PathOptions {
  /** Locale prefixes to drop: `['es', 'en', 'pt']`. */
  locales?: readonly string[];
  /**
   * Route patterns, after dropping the locale. `:name` stands for one
   * segment: `/listings/:id` turns `/listings/812` into `/listings/:id`.
   */
  patterns?: readonly string[];
}

export function normalizePath(raw: string, { locales = [], patterns = [] }: PathOptions = {}): string {
  let segments = raw.split('?')[0].split('#')[0].split('/').filter(Boolean);

  if (segments.length > 0 && locales.includes(segments[0])) segments = segments.slice(1);

  for (const pattern of patterns) {
    const parts = pattern.split('/').filter(Boolean);
    if (parts.length !== segments.length) continue;
    if (parts.every((part, i) => part.startsWith(':') || part === segments[i])) {
      return `/${parts.join('/')}`;
    }
  }

  return `/${segments.join('/')}`.slice(0, 512);
}
