import { visitOrigin } from './visit-origin';

function landOn(url: string, referrer: string) {
  window.history.replaceState(null, '', url);
  Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });
}

describe('visitOrigin', () => {
  it('keeps only the referring domain, never the URL', () => {
    landOn('/es', 'https://www.google.com/search?q=private+query');
    expect(visitOrigin()).toEqual({ referrer: 'www.google.com' });
  });

  it('drops the port, which the hub would reject', () => {
    landOn('/es', 'http://staging.example.com:8080/page');
    expect(visitOrigin().referrer).toBe('staging.example.com');
  });

  it('treats coming from its own pages, with or without www, as navigation', () => {
    landOn('/es', `http://www.${window.location.hostname}/other`);
    expect(visitOrigin().referrer).toBeUndefined();
  });

  it('reads the utm parameters of the landing URL', () => {
    landOn('/es?utm_source=instagram&utm_medium=social&utm_campaign=otono&utm_term=x', '');
    expect(visitOrigin()).toEqual({ utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'otono' });
  });

  it('trims empty and overlong parameters', () => {
    landOn(`/es?utm_source=%20&utm_campaign=${'c'.repeat(150)}`, '');
    const origin = visitOrigin();
    expect(origin.utmSource).toBeUndefined();
    expect(origin.utmCampaign).toHaveLength(100);
  });

  it('ignores a referrer that is not a URL', () => {
    landOn('/es', 'not a url');
    expect(visitOrigin().referrer).toBeUndefined();
  });
});
