'use server';

import { redirect } from 'next/navigation';
import { apiWrite, ApiError } from '@/lib/api';
import { setSession } from '@/lib/session';

export interface LoginState {
  error?: string;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/');

  if (!email || !password) return { error: 'Escribe tu correo y tu contraseña.' };

  let accessToken: string;
  try {
    ({ accessToken } = await apiWrite<{ accessToken: string }>('/auth/login', 'POST', { email, password }));
  } catch (error) {
    if (error instanceof ApiError) {
      // The API limits attempts per account. Answering "wrong credentials"
      // here would send someone with the right password to try again and
      // again, extending the lockout.
      if (error.status === 429) return { error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' };
      // The same message for an unknown email and a wrong password: the API
      // already does it this way, and telling them apart here would turn the
      // login into a checker for which emails exist.
      return { error: 'Credenciales incorrectas.' };
    }
    return { error: 'No se pudo contactar con la API. ¿Está levantada?' };
  }

  await setSession(accessToken);

  // Internal paths only: a `next` with its own host would be an open redirect.
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}
