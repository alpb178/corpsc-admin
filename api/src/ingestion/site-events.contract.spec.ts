import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MAX_PROPS, MAX_PROPS_BYTES, SiteEventsDto, propsProblem } from './site-events.contract';

/** The constraint messages validation raises, flattened through nested events. */
async function problems(body: unknown): Promise<string[]> {
  const errors = await validate(plainToInstance(SiteEventsDto, body), { whitelist: true, forbidNonWhitelisted: true });
  const flatten = (list: typeof errors): string[] =>
    list.flatMap((e) => [...Object.values(e.constraints ?? {}), ...flatten(e.children ?? [])]);
  return flatten(errors);
}

const PAGE_VIEW = { type: 'page_view', sessionId: 'session-aaaa', path: '/es' };

describe('site events contract', () => {
  it('still accepts a v1 request', async () => {
    expect(await problems({ schemaVersion: 1, events: [PAGE_VIEW] })).toEqual([]);
  });

  it('accepts a v2 request with every new field', async () => {
    const event = {
      ...PAGE_VIEW,
      eventId: '0b6f1c1e-3d4a-4c8e-9a52-7a1f0e2b9c11',
      visitorId: 'visitor-aaaa',
      region: 'L',
      city: 'La Paz',
      device: 'tablet',
      browser: 'Safari',
      os: 'iOS',
      language: 'pt',
      screen: 'xxl',
    };
    expect(await problems({ schemaVersion: 2, events: [event] })).toEqual([]);
  });

  it('accepts a custom event', async () => {
    const event = { ...PAGE_VIEW, type: 'custom', name: 'whatsapp_order', props: { items: 3, paid: false } };
    expect(await problems({ schemaVersion: 2, events: [event] })).toEqual([]);
  });

  it('rejects a version it does not understand', async () => {
    expect(await problems({ schemaVersion: 3, events: [PAGE_VIEW] })).not.toEqual([]);
  });

  it.each([
    ['an event id that is not a UUID', { eventId: '1234' }],
    ['a visitor id that is too short', { visitorId: 'abc' }],
    ['a name that is not snake_case', { type: 'custom', name: 'Contact Submit' }],
    ['properties that are not an object', { type: 'custom', name: 'form_sent', props: 'x' }],
    ['an unknown device', { device: 'watch' }],
    ['a language with region', { language: 'pt-BR' }],
    ['a screen in pixels', { screen: '1440' }],
    ['a region in lowercase', { region: 'lp' }],
    ['an unknown event type', { type: 'scroll' }],
    ['a field outside the contract, such as the user agent', { userAgent: 'Mozilla/5.0' }],
  ])('rejects %s', async (_case, overrides) => {
    expect(await problems({ schemaVersion: 2, events: [{ ...PAGE_VIEW, ...overrides }] })).not.toEqual([]);
  });
});

describe('propsProblem', () => {
  it('accepts a small flat object of primitives', () => {
    expect(propsProblem({ plan: 'pro', step: 2, trial: true })).toBeNull();
  });

  it.each([
    ['an array', ['a']],
    ['null', null],
    ['a nested object', { cart: { items: 2 } }],
    ['a key that is not snake_case', { 'Plan Name': 'pro' }],
    ['a long text', { note: 'x'.repeat(101) }],
    ['a number that is not finite', { total: Number.POSITIVE_INFINITY }],
    ['too many keys', Object.fromEntries(Array.from({ length: MAX_PROPS + 1 }, (_, i) => [`k${i}`, i]))],
  ])('rejects %s', (_case, props) => {
    expect(propsProblem(props)).not.toBeNull();
  });

  it('caps the size even when every value is short', () => {
    const props = Object.fromEntries(Array.from({ length: MAX_PROPS }, (_, i) => [`key_${'x'.repeat(26)}${i}`, 'y'.repeat(100)]));
    expect(Buffer.byteLength(JSON.stringify(props))).toBeGreaterThan(MAX_PROPS_BYTES);
    expect(propsProblem(props)).toMatch(/bytes/);
  });
});

/**
 * The example in the docs has to pass the real validation: each team copies
 * it, and if it drifts from the code the hub rejects what they implemented.
 */
describe('docs/envio-de-metricas/ejemplo-eventos.json', () => {
  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), '../docs/envio-de-metricas/ejemplo-eventos.json'), 'utf8'),
  ) as { schemaVersion: number; events: Array<{ type: string; props?: unknown }> };

  it('satisfies the contract the hub validates', async () => {
    expect(await problems(fixture)).toEqual([]);
  });

  it('shows the current version and every event type', () => {
    expect(fixture.schemaVersion).toBe(2);
    expect(new Set(fixture.events.map((e) => e.type))).toEqual(
      new Set(['page_view', 'click', 'site_click', 'custom']),
    );
  });

  it('has properties the hub accepts', () => {
    for (const event of fixture.events.filter((e) => e.props !== undefined)) {
      expect(propsProblem(event.props)).toBeNull();
    }
  });
});
