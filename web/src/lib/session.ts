import 'server-only';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'corpsc_hub_session';

/**
 * La cookie guarda el JWT que emite la API.
 *
 * `httpOnly` es lo que impide que un XSS se lleve el token: el JavaScript de
 * la página nunca llega a verlo, solo el servidor de Next lo lee para
 * reenviarlo a la API.
 */
export async function setSession(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // igual que JWT_EXPIRES_IN en la API
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
