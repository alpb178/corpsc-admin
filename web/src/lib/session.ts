import 'server-only';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'corpsc_hub_session';

/**
 * The cookie holds the JWT issued by the API.
 *
 * `httpOnly` is what stops an XSS from stealing the token: the page's
 * JavaScript never gets to see it; only the Next server reads it to forward
 * it to the API.
 */
export async function setSession(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // same as JWT_EXPIRES_IN in the API
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
