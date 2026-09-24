import 'dotenv/config';
import { Logger, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { CredentialKind, PrismaClient, ProjectKind } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ApiKeyGuard, type PushingProject } from './api-key.guard';
import { CryptoService } from '../common/crypto.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Against Postgres and the real cipher: what matters is which rows the guard
 * reads and what it does when one of them can't be decrypted.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const crypto = new CryptoService();
const guard = new ApiKeyGuard(prisma as unknown as PrismaService, crypto);

const PREFIX = 'test-api-key-guard';
const GOOD_KEY = 'good-key-of-the-guard-test-000001';
const ROTATED_KEY = 'rotated-key-of-the-guard-test-02';
const OFF_KEY = 'inactive-key-of-the-guard-test-3';

function context(key?: string) {
  const request: { project?: PushingProject; header: (name: string) => string | undefined } = {
    header: (name) => (name.toLowerCase() === 'x-api-key' ? key : undefined),
  };
  const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { ctx, request };
}

async function projectWith(suffix: string, sealed: { ciphertext: string; fingerprint: string; keyVersion: number }, active = true) {
  const credential = await prisma.credential.create({
    data: { kind: CredentialKind.API_KEY, label: `${PREFIX}-${suffix}`, ...sealed },
  });
  return prisma.project.create({
    data: {
      slug: `${PREFIX}-${suffix}`,
      name: suffix,
      domain: `${PREFIX}-${suffix}.invalid`,
      kind: ProjectKind.OWN,
      credentialId: credential.id,
      active,
      timezone: 'America/Lima',
      currency: 'PEN',
    },
  });
}

async function cleanup() {
  await prisma.project.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.credential.deleteMany({ where: { label: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup();

  // Sealed with another master key: its row is there, but it can't be read.
  const saved = process.env.HUB_ENCRYPTION_KEY;
  process.env.HUB_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const rotated = new CryptoService().seal(ROTATED_KEY);
  process.env.HUB_ENCRYPTION_KEY = saved;

  await projectWith('rotated', rotated);
  await projectWith('good', crypto.seal(GOOD_KEY));
  await projectWith('off', crypto.seal(OFF_KEY), false);
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ApiKeyGuard', () => {
  it('identifies the project of the key', async () => {
    const { ctx, request } = context(GOOD_KEY);

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(request.project).toEqual({
      id: expect.any(String),
      slug: `${PREFIX}-good`,
      timezone: 'America/Lima',
      currency: 'PEN',
    });
  });

  it('decrypts only the credential whose fingerprint matches, not every project', async () => {
    const open = vi.spyOn(crypto, 'open');
    await guard.canActivate(context(GOOD_KEY).ctx);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("isn't taken down by another project's unreadable credential", async () => {
    // Before, every candidate was decrypted in turn: an unreadable one found
    // first answered 500 to every site.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { ctx } = context(GOOD_KEY);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('answers 401, not 500, to the key of an unreadable credential, and logs which one', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await expect(guard.canActivate(context(ROTATED_KEY).ctx)).rejects.toThrow(UnauthorizedException);
    expect(error).toHaveBeenCalledWith(`The credential of ${PREFIX}-rotated can't be decrypted; generate a new one`);
  });

  it.each([
    ['no key', undefined],
    ['an unknown key', 'a-key-nobody-was-ever-given-000000'],
    ["a deactivated project's key", OFF_KEY],
  ])('answers the same 401 to %s', async (_case, key) => {
    await expect(guard.canActivate(context(key).ctx)).rejects.toThrow('Clave no válida');
  });
});
