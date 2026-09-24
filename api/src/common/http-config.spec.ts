import { allowedOrigins, isAllowedOrigin, isDevelopment } from './http-config';

describe('http config', () => {
  const production = { NODE_ENV: 'production' };
  const development = { NODE_ENV: 'development' };

  describe('isDevelopment', () => {
    it('is on only with NODE_ENV=development', () => {
      expect(isDevelopment(development)).toBe(true);
      expect(isDevelopment(production)).toBe(false);
      expect(isDevelopment({ NODE_ENV: 'test' })).toBe(false);
    });

    it('stays off when NODE_ENV is missing, so a deploy that forgets it stays closed', () => {
      expect(isDevelopment({})).toBe(false);
    });
  });

  describe('allowedOrigins', () => {
    it('always includes the panel', () => {
      expect(allowedOrigins({})).toEqual(['https://hub.corpsc.com']);
    });

    it('adds CORS_ORIGINS, trimmed, without blanks or duplicates', () => {
      expect(
        allowedOrigins({ CORS_ORIGINS: ' https://a.vercel.app, ,https://hub.corpsc.com,https://b.dev ' }),
      ).toEqual(['https://hub.corpsc.com', 'https://a.vercel.app', 'https://b.dev']);
    });
  });

  describe('isAllowedOrigin', () => {
    it('lets through requests without an origin', () => {
      expect(isAllowedOrigin(undefined, production)).toBe(true);
    });

    it('accepts the listed origins in production', () => {
      const env = { ...production, CORS_ORIGINS: 'https://preview.vercel.app' };
      expect(isAllowedOrigin('https://hub.corpsc.com', env)).toBe(true);
      expect(isAllowedOrigin('https://preview.vercel.app', env)).toBe(true);
    });

    it('rejects localhost in production', () => {
      expect(isAllowedOrigin('http://localhost:3000', production)).toBe(false);
    });

    it('rejects localhost when NODE_ENV is missing', () => {
      expect(isAllowedOrigin('http://localhost:3000', {})).toBe(false);
    });

    it('accepts any localhost port in development', () => {
      expect(isAllowedOrigin('http://localhost:3000', development)).toBe(true);
      expect(isAllowedOrigin('http://localhost:5173', development)).toBe(true);
    });

    it('does not take a look-alike host for localhost', () => {
      expect(isAllowedOrigin('http://localhost:3000.evil.com', development)).toBe(false);
      expect(isAllowedOrigin('https://localhost:3000', development)).toBe(false);
    });

    it('rejects an unknown origin', () => {
      expect(isAllowedOrigin('https://evil.com', development)).toBe(false);
    });
  });
});
