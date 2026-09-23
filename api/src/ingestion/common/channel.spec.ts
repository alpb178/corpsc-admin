import { channelOf, sourceOf, DIRECT } from './channel';

const origin = (referrer: string | null, utmSource: string | null = null, utmMedium: string | null = null) => ({
  referrer,
  utmSource,
  utmMedium,
});

describe('channelOf', () => {
  it.each([
    [origin(null), 'Direct'],
    [origin('google.com'), 'Organic Search'],
    [origin('google.com.bo'), 'Organic Search'],
    [origin('bing.com'), 'Organic Search'],
    [origin('instagram.com'), 'Organic Social'],
    [origin('t.co'), 'Organic Social'],
    [origin('youtube.com'), 'Organic Video'],
    [origin('mail.google.com'), 'Email'],
    [origin('blog.example.org'), 'Referral'],
    [origin(null, 'google', 'cpc'), 'Paid Search'],
    [origin(null, 'facebook', 'paid_social'), 'Paid Social'],
    [origin(null, 'newsletter', 'email'), 'Email'],
    [origin(null, 'partner-site', 'banner'), 'Referral'],
    [origin(null, 'somewhere', 'cpm'), 'Display'],
    // La campaña manda sobre el dominio: un anuncio de Instagram abierto desde
    // Google sigue siendo de Instagram.
    [origin('google.com', 'instagram', 'social'), 'Organic Social'],
  ])('%j → %s', (o, expected) => {
    expect(channelOf(o)).toBe(expected);
  });
});

describe('sourceOf', () => {
  it('prefers the campaign source, then the domain', () => {
    expect(sourceOf(origin('google.com', 'newsletter'))).toBe('newsletter');
    expect(sourceOf(origin('google.com'))).toBe('google.com');
    expect(sourceOf(origin(null))).toBe(DIRECT);
  });
});
