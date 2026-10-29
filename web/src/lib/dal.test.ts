import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(async () => null as string | null),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock('./session', () => ({ getToken: mocks.getToken }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { getUser, requireUser } from './dal';

const fetchMock = vi.fn();
const user = { id: '1', email: 'ana@corpsc.com', name: 'Ana', role: 'ADMIN' };

beforeEach(() => {
  process.env.API_URL = 'http://api.test/api';
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.getToken.mockReset().mockResolvedValue(null);
  mocks.redirect.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe('getUser', () => {
  it('is null without a token, without asking the API', async () => {
    await expect(getUser()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is null when the API rejects the token', async () => {
    mocks.getToken.mockResolvedValue('dead-token');
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(getUser()).resolves.toBeNull();
  });

  it('is null when the API is unreachable, the same as an invalid session from here', async () => {
    mocks.getToken.mockResolvedValue('a-token');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getUser()).resolves.toBeNull();
  });

  it('returns the user the API confirms', async () => {
    mocks.getToken.mockResolvedValue('a-token');
    fetchMock.mockResolvedValue(Response.json(user));
    await expect(getUser()).resolves.toEqual(user);
  });
});

describe('requireUser', () => {
  it('sends a never-logged-in visitor to a plain /login', async () => {
    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT /login');
    expect(mocks.redirect).toHaveBeenCalledWith('/login');
  });

  it('says so instead of a silent /login when a token died, without touching the cookie itself', async () => {
    // A page/layout render can't write a cookie (Next only allows that from a
    // Server Action or a Route Handler) — clearing the dead one happens
    // client-side instead, once the browser lands on `/login?reason=expired`.
    mocks.getToken.mockResolvedValue('dead-token');
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT /login?reason=expired');
    expect(mocks.redirect).toHaveBeenCalledWith('/login?reason=expired');
  });

  it('returns the user when the session is valid', async () => {
    mocks.getToken.mockResolvedValue('a-token');
    fetchMock.mockResolvedValue(Response.json(user));

    await expect(requireUser()).resolves.toEqual(user);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
