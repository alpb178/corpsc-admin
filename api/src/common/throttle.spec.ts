import { Body, Controller, HttpCode, type INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import {
  DEFAULT_INGEST_PER_MINUTE,
  IngestThrottlerGuard,
  LoginThrottlerGuard,
  throttlerOptions,
} from './throttle';

/** Stand-ins for the real controllers: what's under test is the guards. */
@Controller('ingest')
@UseGuards(IngestThrottlerGuard)
class FakeIngestController {
  @Post('events')
  @HttpCode(202)
  receive() {
    return { accepted: 1 };
  }
}

@Controller('auth')
class FakeAuthController {
  @Post('login')
  @UseGuards(LoginThrottlerGuard)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @HttpCode(200)
  login(@Body() _body: unknown) {
    return { ok: true };
  }
}

describe('throttlerOptions', () => {
  it('uses the default when nothing is configured', () => {
    expect(throttlerOptions({})).toEqual([{ name: 'default', ttl: 60_000, limit: DEFAULT_INGEST_PER_MINUTE }]);
  });

  it('reads the limit from the environment', () => {
    expect(throttlerOptions({ INGEST_RATE_LIMIT_PER_MINUTE: '120' })).toMatchObject([{ limit: 120 }]);
  });

  it.each(['0', '-5', 'many', '1.5'])('ignores a nonsensical limit (%s)', (value) => {
    expect(throttlerOptions({ INGEST_RATE_LIMIT_PER_MINUTE: value })).toMatchObject([
      { limit: DEFAULT_INGEST_PER_MINUTE },
    ]);
  });
});

describe('throttling guards', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 3 }])],
      controllers: [FakeIngestController, FakeAuthController],
    }).compile();

    app = module.createNestApplication();
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = (path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
    fetch(`${base.replace('[::1]', 'localhost')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then((r) => r.status);

  it('counts ingestion per project key, so one busy site does not starve another', async () => {
    const busy = { 'X-Api-Key': 'key-of-a-busy-site' };
    const quiet = { 'X-Api-Key': 'key-of-a-quiet-site' };

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push(await post('/ingest/events', busy));

    expect(statuses).toEqual([202, 202, 202, 429]);
    expect(await post('/ingest/events', quiet)).toBe(202);
  });

  it('throttles requests without a key too, by address', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push(await post('/ingest/events'));

    expect(statuses.at(-1)).toBe(429);
  });

  it('counts login attempts per account, not per address', async () => {
    const attempt = (email: string) => post('/auth/login', {}, { email, password: 'wrong-password' });

    expect([await attempt('ana@corpsc.com'), await attempt('ANA@corpsc.com '), await attempt('ana@corpsc.com')]).toEqual([
      200, 200, 429,
    ]);
    // Everyone logs in from the panel's server: someone else's account is unaffected.
    expect(await attempt('luis@corpsc.com')).toBe(200);
  });
});
