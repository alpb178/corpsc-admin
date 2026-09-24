import 'dotenv/config';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Aggregation, MetricUnit, PrismaClient, ProjectKind, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { AppModule } from './app.module';

/**
 * The API as a client sees it: the real app, over HTTP, against Postgres.
 *
 * What the unit specs can't reach lives here: that each route has the guard
 * it should, that a VIEWER can read and not write, that a site's key only
 * writes to its own project, that validation answers 400 before a service is
 * touched. Built like `main.ts` —prefix and validation pipe—, which is the
 * one piece coverage leaves out.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Response bodies are read freely in these tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const PREFIX = 'test-http';
const PASSWORD = 'correct-horse-battery';
const ADMIN = `${PREFIX}-admin@corpsc.test`;
const VIEWER = `${PREFIX}-viewer@corpsc.test`;
const SLUG = `${PREFIX}-site`;

let app: INestApplication;
let base: string;
let adminToken: string;
let viewerToken: string;

async function call(
  method: string,
  path: string,
  { token, body, headers = {} }: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Json) : null };
}

async function login(email: string): Promise<string> {
  const { status, body } = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  expect(status).toBe(200);
  return body.accessToken as string;
}

async function cleanup() {
  await prisma.project.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.credential.deleteMany({ where: { label: { startsWith: PREFIX } } });
  await prisma.hubUser.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
  // The catalog entries these tests read, as the seed creates them: CI starts
  // from an empty, migrated database. Existing ones are left as they are.
  for (const definition of [
    { key: 'visits', label: 'Visitas', unit: MetricUnit.COUNT },
    {
      key: 'conversion_rate',
      label: 'Tasa de conversión',
      unit: MetricUnit.RATIO,
      aggregation: Aggregation.WEIGHTED_AVG,
      derivedFrom: { numerator: 'orders', denominator: 'visits' },
    },
  ]) {
    await prisma.metricDefinition.upsert({ where: { key: definition.key }, update: {}, create: definition });
  }
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  await prisma.hubUser.createMany({
    data: [
      { email: ADMIN, name: 'Admin HTTP', passwordHash, role: Role.ADMIN },
      { email: VIEWER, name: 'Viewer HTTP', passwordHash, role: Role.VIEWER },
      { email: `${PREFIX}-off@corpsc.test`, name: 'Off', passwordHash, role: Role.ADMIN, active: false },
    ],
  });
  await prisma.project.create({
    data: { slug: SLUG, name: 'HTTP site', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN, sortOrder: 9500 },
  });

  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0);
  base = (await app.getUrl()).replace('[::1]', 'localhost');

  adminToken = await login(ADMIN);
  viewerToken = await login(VIEWER);
});

afterAll(async () => {
  await app?.close();
  await cleanup();
  await prisma.$disconnect();
});

describe('auth', () => {
  it('logs in, says who the session belongs to and records the login', async () => {
    const me = await call('GET', '/auth/me', { token: adminToken });
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ id: expect.any(String), email: ADMIN, name: 'Admin HTTP', role: 'ADMIN' });

    const user = await prisma.hubUser.findUniqueOrThrow({ where: { email: ADMIN } });
    expect(user.lastLoginAt).not.toBeNull();
  });

  it.each([
    ['a wrong password', { email: ADMIN, password: 'not-the-password' }],
    ['an unknown email', { email: `${PREFIX}-nobody@corpsc.test`, password: PASSWORD }],
    ['a deactivated user', { email: `${PREFIX}-off@corpsc.test`, password: PASSWORD }],
  ])('answers the same 401 for %s', async (_case, body) => {
    const { status, body: error } = await call('POST', '/auth/login', { body });
    expect(status).toBe(401);
    expect(error.message).toBe('Credenciales incorrectas');
  });

  it('validates the login before looking anything up', async () => {
    expect((await call('POST', '/auth/login', { body: { email: 'not-an-email', password: 'x' } })).status).toBe(400);
  });

  it('rejects a missing, forged or orphaned token', async () => {
    expect((await call('GET', '/auth/me')).status).toBe(401);
    expect((await call('GET', '/auth/me', { token: 'forged.token.value' })).status).toBe(401);

    // A valid token whose user was deactivated afterwards: the role is read on
    // every request, so the change applies at once.
    const temp = `${PREFIX}-temp@corpsc.test`;
    await prisma.hubUser.create({
      data: { email: temp, name: 'Temp', passwordHash: await bcrypt.hash(PASSWORD, 4), role: Role.VIEWER },
    });
    const token = await login(temp);
    await prisma.hubUser.update({ where: { email: temp }, data: { active: false } });
    expect((await call('GET', '/auth/me', { token })).status).toBe(401);
  });

  it('lets only an admin list and create users, never showing a password hash', async () => {
    expect((await call('GET', '/auth/users', { token: viewerToken })).status).toBe(403);

    const created = await call('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${PREFIX}-new@corpsc.test`, name: 'Nueva', password: 'a-long-password' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(String), email: `${PREFIX}-new@corpsc.test`, name: 'Nueva', role: 'VIEWER' });

    const again = await call('POST', '/auth/users', {
      token: adminToken,
      body: { email: `${PREFIX}-new@corpsc.test`, name: 'Otra', password: 'a-long-password' },
    });
    expect(again.status).toBe(409);

    const list = await call('GET', '/auth/users', { token: adminToken });
    expect(list.status).toBe(200);
    expect(list.body.some((u: { email: string }) => u.email === ADMIN)).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain('passwordHash');
  });
});

describe('projects and goals', () => {
  it('lists sites for any role and lets only an admin change them', async () => {
    const list = await call('GET', '/projects', { token: viewerToken });
    expect(list.status).toBe(200);
    expect(list.body.map((p: { slug: string }) => p.slug)).toContain(SLUG);

    expect((await call('PATCH', `/projects/${SLUG}`, { token: viewerToken, body: { sortOrder: 1 } })).status).toBe(403);
    const updated = await call('PATCH', `/projects/${SLUG}`, {
      token: adminToken,
      body: { timezone: 'America/Lima', currency: 'PEN' },
    });
    expect(updated.body).toMatchObject({ timezone: 'America/Lima', currency: 'PEN' });

    expect((await call('PATCH', `/projects/${SLUG}`, { token: adminToken, body: { timezone: 'Mars/Olympus' } })).status).toBe(400);
    expect((await call('GET', `/projects/${PREFIX}-nope`, { token: viewerToken })).status).toBe(404);
  });

  it('hides inactive sites unless asked', async () => {
    await prisma.project.update({ where: { slug: SLUG }, data: { active: false } });
    try {
      const active = await call('GET', '/projects', { token: viewerToken });
      expect(active.body.map((p: { slug: string }) => p.slug)).not.toContain(SLUG);
      const all = await call('GET', '/projects?includeInactive=true', { token: viewerToken });
      expect(all.body.map((p: { slug: string }) => p.slug)).toContain(SLUG);
    } finally {
      await prisma.project.update({ where: { slug: SLUG }, data: { active: true } });
    }
  });

  it('manages conversion goals, admins only', async () => {
    const path = `/projects/${SLUG}/goals/contact_submit`;
    expect((await call('PUT', path, { token: viewerToken, body: { label: 'Contacto' } })).status).toBe(403);
    expect((await call('PUT', path, { token: adminToken, body: { label: 'Contacto' } })).status).toBe(200);
    expect((await call('GET', `/projects/${SLUG}/goals`, { token: viewerToken })).body).toEqual([
      expect.objectContaining({ eventName: 'contact_submit', label: 'Contacto', active: true }),
    ]);
    expect((await call('DELETE', path, { token: adminToken })).status).toBe(204);
    expect((await call('DELETE', path, { token: adminToken })).status).toBe(404);
  });
});

describe('credentials and ingestion', () => {
  let secret: string;

  it('creates a key shown only once, assigns it, and never lists the secret', async () => {
    expect((await call('GET', '/credentials', { token: viewerToken })).status).toBe(403);

    const created = await call('POST', '/credentials', { token: adminToken, body: { label: `${PREFIX} key` } });
    expect(created.status).toBe(201);
    secret = created.body.secret;
    expect(secret.length).toBeGreaterThanOrEqual(32);

    const assigned = await call('PUT', `/projects/${SLUG}/credential/${created.body.id}`, { token: adminToken });
    expect(assigned.body).toMatchObject({ slug: SLUG, credential: { id: created.body.id } });

    const listed = await call('GET', '/credentials', { token: adminToken });
    const mine = listed.body.find((c: { id: string }) => c.id === created.body.id);
    expect(mine.projects).toEqual([{ slug: SLUG, name: 'HTTP site' }]);
    expect(JSON.stringify(listed.body)).not.toContain(secret);
    expect(JSON.stringify(listed.body)).not.toContain('ciphertext');
  });

  it('rejects a key that is too short, and assignments to what does not exist', async () => {
    expect(
      (await call('POST', '/credentials', { token: adminToken, body: { label: `${PREFIX} short`, secret: 'short' } })).status,
    ).toBe(400);
    expect((await call('PUT', `/projects/${PREFIX}-nope/credential/x`, { token: adminToken })).status).toBe(404);
    expect(
      (await call('PUT', `/projects/${SLUG}/credential/00000000-0000-0000-0000-000000000000`, { token: adminToken })).status,
    ).toBe(404);
    expect((await call('DELETE', `/projects/${PREFIX}-nope/credential`, { token: adminToken })).status).toBe(404);
  });

  it('takes events only with the right key, for its own project', async () => {
    const payload = {
      schemaVersion: 2,
      events: [{ type: 'page_view', sessionId: 'session-http-aa', visitorId: 'visitor-http-aa', path: '/' }],
    };

    expect((await call('POST', '/ingest/events', { body: payload })).status).toBe(401);
    expect((await call('POST', '/ingest/events', { body: payload, headers: { 'X-Api-Key': 'wrong' } })).status).toBe(401);

    const accepted = await call('POST', '/ingest/events', { body: payload, headers: { 'X-Api-Key': secret } });
    expect(accepted).toEqual({ status: 202, body: { accepted: 1, duplicates: 0 } });

    const project = await prisma.project.findUniqueOrThrow({ where: { slug: SLUG } });
    expect(await prisma.siteEvent.count({ where: { projectId: project.id } })).toBe(1);
  });

  it('answers 400 to a malformed request before storing anything', async () => {
    const bad = await call('POST', '/ingest/events', {
      body: { schemaVersion: 2, events: [{ type: 'page_view', path: '/', sessionId: 'x' }] },
      headers: { 'X-Api-Key': secret },
    });
    expect(bad.status).toBe(400);
  });

  it('takes a daily aggregate through the other door, with the same key', async () => {
    const pushed = await call('POST', '/ingest/metrics', {
      headers: { 'X-Api-Key': secret },
      body: {
        schemaVersion: 1,
        project: SLUG,
        timezone: 'America/Lima',
        range: { from: '2031-01-01', to: '2031-01-01' },
        definitions: [{ key: 'orders', label: 'Pedidos', unit: 'count' }],
        days: [{ date: '2031-01-01', metrics: { orders: 3 } }],
      },
    });
    expect(pushed.status).toBe(200);
    expect(pushed.body).toMatchObject({ status: 'SUCCESS', rowsWritten: 1 });
  });

  it('revokes the key: data stays, sending stops', async () => {
    expect((await call('DELETE', `/projects/${SLUG}/credential`, { token: adminToken })).body).toMatchObject({ revoked: true });
    const payload = { schemaVersion: 1, events: [{ type: 'page_view', sessionId: 'session-http-bb', path: '/' }] };
    expect((await call('POST', '/ingest/events', { body: payload, headers: { 'X-Api-Key': secret } })).status).toBe(401);
  });
});

describe('metrics', () => {
  const range = 'from=2031-01-01&to=2031-01-02';

  it('are readable by any role, and not without a session', async () => {
    expect((await call('GET', `/metrics/overview?${range}`)).status).toBe(401);

    for (const path of [
      `/metrics/overview?${range}&compare=true`,
      `/metrics/projects/${SLUG}?${range}`,
      `/metrics/visitors?${range}&project=${SLUG}`,
      `/metrics/realtime?project=${SLUG}&minutes=10`,
      `/metrics/compare?${range}&slugs=${SLUG}&metric=orders`,
      '/metrics/definitions',
      '/metrics/freshness',
      '/metrics/runs',
    ]) {
      expect((await call('GET', path, { token: viewerToken })).status, path).toBe(200);
    }
  });

  it('reads the aggregate pushed for the site', async () => {
    const detail = await call('GET', `/metrics/projects/${SLUG}?${range}`, { token: viewerToken });
    expect(detail.body.totals.orders).toBe(3);

    const compare = await call('GET', `/metrics/compare?${range}&slugs=${SLUG}&metric=orders`, { token: viewerToken });
    expect(compare.body.series[0].points).toEqual([{ date: '2031-01-01', value: 3 }]);
  });

  it('rejects impossible ranges and comparisons', async () => {
    const token = viewerToken;
    expect((await call('GET', '/metrics/overview?from=2031-02-31&to=2031-03-01', { token })).status).toBe(400);
    expect((await call('GET', '/metrics/overview?from=2031-03-02&to=2031-03-01', { token })).status).toBe(400);
    expect((await call('GET', '/metrics/overview?from=yesterday&to=today', { token })).status).toBe(400);
    expect((await call('GET', `/metrics/compare?${range}&slugs=`, { token })).status).toBe(400);
    expect((await call('GET', `/metrics/compare?${range}&slugs=${SLUG}&metric=nope`, { token })).status).toBe(400);
    expect((await call('GET', `/metrics/compare?${range}&slugs=${SLUG}&metric=conversion_rate`, { token })).status).toBe(400);
    expect((await call('GET', `/metrics/compare?${range}&slugs=${PREFIX}-nope`, { token })).status).toBe(404);
    expect((await call('GET', `/metrics/realtime?minutes=0`, { token })).status).toBe(400);
  });

  it('uses visits as the default comparison metric', async () => {
    const compare = await call('GET', `/metrics/compare?${range}&slugs=${SLUG}`, { token: viewerToken });
    expect(compare.body.metric.key).toBe('visits');
  });
});

describe('health', () => {
  it('answers without a session, for the host and the monitors', async () => {
    expect((await call('GET', '/health')).body).toMatchObject({ status: 'ok' });
    expect((await call('GET', '/health/db')).body).toEqual({ database: 'up' });
  });
});
