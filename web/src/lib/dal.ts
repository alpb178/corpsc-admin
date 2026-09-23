import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getToken } from './session';
import type { HubRole } from './types';

/** The same enum as the API. It lives in `types.ts` so client components,
 *  which can't import this module, can read it too. */
export type Role = HubRole;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Data access layer: the panel's security lives HERE.
 *
 * The Next 16 docs are explicit: `proxy.ts` is an experience layer, not a
 * security one. Server Functions run as a POST against their own route, so a
 * change to the proxy's `matcher` can leave them uncovered without anyone
 * noticing. That's why every page and every action calls `requireUser()`, and
 * the proxy only makes sure someone without a cookie sees the login instead of
 * an empty screen.
 *
 * React's `cache()` memoizes it per request: ten components can ask for the
 * user and the API is only asked once.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  const token = await getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${process.env.API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as AuthUser;
  } catch {
    // The API being down is not the same as an invalid session, but from here
    // they can't be told apart: either way there's no verified user and no way in.
    return null;
  }
});

/** For pages and actions: either there's a user, or we go no further. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

export async function requireRole(...roles: Role[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect('/');
  return user;
}
