import { normalizePath } from './path';

describe('normalizePath', () => {
  const options = { locales: ['es', 'en', 'pt'], patterns: ['/listings/:id', '/shop/:category/:product'] };

  it.each([
    ['/es', '/'],
    ['/es/', '/'],
    ['/', '/'],
    ['', '/'],
    ['/en/precios', '/precios'],
    ['/pt/listings/812', '/listings/:id'],
    ['/listings/813', '/listings/:id'],
    ['/shop/tea/green-tea', '/shop/:category/:product'],
    // A pattern only matches the same number of segments.
    ['/listings/813/edit', '/listings/813/edit'],
    ['/listings', '/listings'],
    // Not a declared locale: left as it is.
    ['/fr/precios', '/fr/precios'],
    ['/es/precios?utm_source=x#top', '/precios'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePath(raw, options)).toBe(expected);
  });

  it('changes nothing the site did not describe', () => {
    expect(normalizePath('/es/listings/812')).toBe('/es/listings/812');
  });

  it('keeps the path within what the hub stores', () => {
    expect(normalizePath(`/${'a'.repeat(600)}`)).toHaveLength(512);
  });
});
