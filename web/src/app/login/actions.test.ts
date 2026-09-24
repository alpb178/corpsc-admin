import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock('@/lib/session', () => ({ setSession: mocks.setSession }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { login } from './actions';

const fetchMock = vi.fn();

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const credentials = { email: ' ana@corpsc.com ', password: 'secreta-larga' };

beforeEach(() => {
  process.env.API_URL = 'http://api.test/api';
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  mocks.setSession.mockReset();
  mocks.redirect.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe('login', () => {
  it('asks for both fields before calling the API', async () => {
    await expect(login({}, form({ email: 'ana@corpsc.com' }))).resolves.toEqual({
      error: 'Escribe tu correo y tu contraseña.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says so when the API is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(login({}, form(credentials))).resolves.toEqual({
      error: 'No se pudo contactar con la API. ¿Está levantada?',
    });
  });

  it('tells a lockout apart from wrong credentials', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    await expect(login({}, form(credentials))).resolves.toEqual({
      error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.',
    });
  });

  it('gives the same message for any other rejection', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(login({}, form(credentials))).resolves.toEqual({ error: 'Credenciales incorrectas.' });
  });

  it('stores the session and goes to the requested internal page', async () => {
    fetchMock.mockResolvedValue(Response.json({ accessToken: 'jwt' }));

    await expect(login({}, form({ ...credentials, next: '/compare' }))).rejects.toThrow(
      'NEXT_REDIRECT /compare',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'ana@corpsc.com', password: 'secreta-larga' }),
      }),
    );
    expect(mocks.setSession).toHaveBeenCalledWith('jwt');
  });

  it('never redirects to another host', async () => {
    fetchMock.mockResolvedValue(Response.json({ accessToken: 'jwt' }));
    await expect(login({}, form({ ...credentials, next: '//evil.com' }))).rejects.toThrow('NEXT_REDIRECT /');
    expect(mocks.redirect).toHaveBeenCalledWith('/');
  });
});
