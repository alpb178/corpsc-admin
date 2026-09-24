import { MAX_PROPS, isValidProps, newEventId, screenBucket } from './contract';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('screenBucket', () => {
  it.each([
    [320, 'xs'], [575, 'xs'], [576, 'sm'], [767, 'sm'], [768, 'md'],
    [991, 'md'], [992, 'lg'], [1199, 'lg'], [1200, 'xl'], [1439, 'xl'], [1440, 'xxl'], [2560, 'xxl'],
  ])('%i px is %s', (width, bucket) => {
    expect(screenBucket(width)).toBe(bucket);
  });
});

describe('isValidProps', () => {
  it('accepts a small flat object of primitives', () => {
    expect(isValidProps({ plan: 'pro', step: 2, trial: false })).toBe(true);
  });

  it.each([
    ['null', null],
    ['an array', ['a']],
    ['a nested object', { cart: { items: 1 } }],
    ['a key that is not snake_case', { Plan: 'pro' }],
    ['a long text', { note: 'x'.repeat(101) }],
    ['a number that is not finite', { total: Number.NaN }],
    ['too many keys', Object.fromEntries(Array.from({ length: MAX_PROPS + 1 }, (_, i) => [`k${i}`, i]))],
    ['more than a kilobyte', Object.fromEntries(Array.from({ length: MAX_PROPS }, (_, i) => [`key_${'x'.repeat(26)}${i}`, 'y'.repeat(100)]))],
  ])('rejects %s', (_case, props) => {
    expect(isValidProps(props)).toBe(false);
  });
});

describe('newEventId', () => {
  it('returns a v4 UUID', () => {
    expect(newEventId()).toMatch(UUID);
  });

  it('builds one by hand where randomUUID is missing', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const ids = new Set(Array.from({ length: 50 }, newEventId));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(UUID);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
