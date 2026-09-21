'use server';

import { redirect } from 'next/navigation';
import { setSession } from '@/lib/session';

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  if (!email || !password) return { error: 'Escribe tu correo y tu contraseña.' };

  let response: Response;
  try {
    response = await fetch(`${process.env.API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { error: 'No se pudo contactar con la API. ¿Está levantada?' };
  }

  if (!response.ok) {
    // El mismo mensaje para correo inexistente y contraseña incorrecta: la API
    // ya lo hace así, y distinguirlos aquí convertiría el login en un
    // verificador de qué correos existen.
    return { error: 'Credenciales incorrectas.' };
  }

  const { accessToken } = (await response.json()) as { accessToken: string };
  await setSession(accessToken);

  // Solo rutas internas: un `next` con host propio sería un redirect abierto.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
