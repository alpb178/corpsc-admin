import { resolveTarget } from './group-sites';

const OWN = 'www.corpsc.com';

describe('resolveTarget', () => {
  it('names the group site a link goes to, with or without www', () => {
    expect(resolveTarget('https://take.corpsc.com/es', OWN)).toEqual({ slug: 'take', linkType: 'web' });
    expect(resolveTarget('https://www.tu-chamba.corpsc.com/', OWN)).toEqual({ slug: 'tu-chamba', linkType: 'web' });
  });

  it.each([
    ['a relative link', '/es/contacto'],
    ['a link to this very site', 'https://corpsc.com/es'],
    ['another website', 'https://example.com'],
    ['a mailto', 'mailto:hola@corpsc.com'],
    ['a phone number', 'tel:+59170000000'],
  ])('ignores %s', (_case, href) => {
    expect(resolveTarget(href, OWN)).toBeNull();
  });

  it('ignores a link back to this site even on a dev port', () => {
    expect(resolveTarget('http://localhost:3000/es', 'localhost:3000', { localhost: 'corpsc' })).toBeNull();
  });

  it('resolves store links by exact URL before the host', () => {
    const store = { 'https://apps.apple.com/app/take/id1': { slug: 'take', linkType: 'ios' as const } };
    expect(resolveTarget('https://apps.apple.com/app/take/id1', OWN, undefined, store)).toEqual({ slug: 'take', linkType: 'ios' });
    expect(resolveTarget('https://apps.apple.com/app/other/id2', OWN, undefined, store)).toBeNull();
  });

  it('takes the registry the site passes', () => {
    expect(resolveTarget('https://dandomuela.com', OWN, { 'dandomuela.com': 'dandomuela' })).toEqual({ slug: 'dandomuela', linkType: 'web' });
  });
});
