import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getToken } from './session';
import type { HubRole } from './types';

/** El mismo enum que la API. Vive en `types.ts` para que lo puedan leer
 *  también los componentes de cliente, que no pueden importar este módulo. */
export type Role = HubRole;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Capa de acceso a datos: AQUÍ vive la seguridad del panel.
 *
 * La documentación de Next 16 es explícita: `proxy.ts` es capa de experiencia,
 * no de seguridad. Las Server Functions se ejecutan como POST contra su propia
 * ruta, así que un cambio en el `matcher` del proxy puede dejarlas sin
 * cobertura sin que nadie lo note. Por eso toda página y toda acción llaman a
 * `requireUser()`, y el proxy solo se encarga de que quien no tenga cookie vea
 * el login en vez de una pantalla vacía.
 *
 * `cache()` de React lo memoriza por petición: diez componentes pueden pedir
 * el usuario y solo se pregunta una vez a la API.
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
    // La API caída no es lo mismo que una sesión inválida, pero desde aquí no
    // se distinguen: en ambos casos no hay usuario verificado y no se entra.
    return null;
  }
});

/** Para páginas y acciones: o hay usuario, o no se sigue. */
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
