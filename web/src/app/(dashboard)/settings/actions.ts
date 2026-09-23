'use server';

import { revalidatePath } from 'next/cache';
import { apiWrite, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/dal';
import type { AdminProject, CredentialSummary, HubRole } from '@/lib/types';

export interface ActionState {
  error?: string;
  ok?: string;
}

export interface KeyState extends ActionState {
  /**
   * The plaintext key. The API returns it ONCE, when it's created, and after
   * that it only exists encrypted. It travels as far as the form so it can be
   * shown, and goes no further: the panel doesn't store it anywhere.
   */
  secret?: { value: string; project: string };
}

/**
 * Every action checks the role before touching the API.
 *
 * It doesn't replace the server's guard —that still has the last word—, but
 * without it a Server Function would be open to anyone with a session,
 * because it runs as a POST against its own route and the proxy doesn't
 * cover it.
 */
async function requireAdmin(): Promise<void> {
  await requireRole('ADMIN');
}

/** Turns the API error into something readable in the form. */
function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export async function updateProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const slug = String(formData.get('slug') ?? '');
  if (!slug) return { error: 'Falta el proyecto.' };

  const sortOrder = Number(formData.get('sortOrder'));
  if (!Number.isInteger(sortOrder)) return { error: 'El orden debe ser un número entero.' };

  // ISO 4217 in upper case: the API compares the code as is, so "bob" and
  // "BOB" would end up as two different currencies when summing revenue.
  const currency = String(formData.get('currency') ?? '').trim().toUpperCase();

  try {
    await apiWrite<AdminProject>(`/projects/${slug}`, 'PATCH', {
      name: String(formData.get('name') ?? '').trim(),
      timezone: String(formData.get('timezone') ?? '').trim(),
      // Empty is not the same as "remove it": the API only accepts a
      // three-letter code, so a blank field is left as it was.
      ...(currency ? { currency } : {}),
      active: formData.get('active') === 'on',
      sortOrder,
    });
  } catch (error) {
    return { error: readableError(error, 'No se pudieron guardar los ajustes.') };
  }

  revalidatePath('/settings/projects');
  return { ok: 'Ajustes guardados.' };
}

/**
 * Generates a new key and assigns it to the project in the same step.
 *
 * It's two calls because the API separates creating from assigning: a key can
 * exist without a project. If the second one fails, the key stays created and
 * unassigned, so we say so instead of leaving a silent orphan.
 */
export async function createKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  await requireAdmin();

  const slug = String(formData.get('slug') ?? '');
  const name = String(formData.get('name') ?? slug);
  if (!slug) return { error: 'Falta el proyecto.' };

  let credential: CredentialSummary & { secret: string };
  try {
    credential = await apiWrite<CredentialSummary & { secret: string }>('/credentials', 'POST', {
      label: `${name} (envío)`,
    });
  } catch (error) {
    return { error: readableError(error, 'No se pudo crear la clave.') };
  }

  try {
    await apiWrite(`/projects/${slug}/credential/${credential.id}`, 'PUT');
  } catch (error) {
    return {
      error: `${readableError(error, 'No se pudo asignar la clave.')} La clave se creó igualmente (${credential.fingerprint}): asígnala a mano o bórrala.`,
    };
  }

  revalidatePath('/settings/projects');
  return { secret: { value: credential.secret, project: name } };
}

export async function assignKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const slug = String(formData.get('slug') ?? '');
  const credentialId = String(formData.get('credentialId') ?? '');
  if (!slug || !credentialId) return { error: 'Elige una clave.' };

  try {
    await apiWrite(`/projects/${slug}/credential/${credentialId}`, 'PUT');
  } catch (error) {
    return { error: readableError(error, 'No se pudo asignar la clave.') };
  }

  revalidatePath('/settings/projects');
  return { ok: 'Clave asignada.' };
}

export async function revokeKey(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const slug = String(formData.get('slug') ?? '');
  if (!slug) return { error: 'Falta el proyecto.' };

  try {
    await apiWrite(`/projects/${slug}/credential`, 'DELETE');
  } catch (error) {
    return { error: readableError(error, 'No se pudo revocar la clave.') };
  }

  revalidatePath('/settings/projects');
  // Data already sent is not deleted: it's the history.
  return { ok: 'Clave revocada. Los datos ya enviados se conservan.' };
}

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'VIEWER') as HubRole;

  if (!email || !name || !password) return { error: 'Faltan datos.' };
  if (password.length < 10) return { error: 'La contraseña debe tener al menos 10 caracteres.' };

  try {
    await apiWrite('/auth/users', 'POST', { email, name, password, role });
  } catch (error) {
    return { error: readableError(error, 'No se pudo crear el usuario.') };
  }

  revalidatePath('/settings/users');
  return { ok: `${name} ya puede entrar al panel.` };
}
