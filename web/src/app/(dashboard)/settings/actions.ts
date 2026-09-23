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
   * La clave en claro. La API la devuelve UNA sola vez, al crearla, y después
   * solo queda cifrada. Viaja hasta el formulario para poder enseñarla y de
   * ahí no pasa: no se guarda en ningún sitio del panel.
   */
  secret?: { value: string; project: string };
}

/**
 * Cada acción comprueba el rol antes de tocar la API.
 *
 * No sustituye al guard del servidor —esa sigue siendo la última palabra—,
 * pero sin ella una Server Function quedaría abierta a cualquiera con sesión,
 * porque se ejecuta como POST contra su propia ruta y el proxy no la cubre.
 */
async function requireAdmin(): Promise<void> {
  await requireRole('ADMIN');
}

/** Convierte el error de la API en algo que se pueda leer en el formulario. */
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

  // ISO 4217 en mayúsculas: la API compara el código tal cual y "bob" y "BOB"
  // acabarían siendo dos monedas distintas al sumar ingresos.
  const currency = String(formData.get('currency') ?? '').trim().toUpperCase();

  try {
    await apiWrite<AdminProject>(`/projects/${slug}`, 'PATCH', {
      name: String(formData.get('name') ?? '').trim(),
      timezone: String(formData.get('timezone') ?? '').trim(),
      // Vacío no es lo mismo que "quítala": la API solo acepta un código de
      // tres letras, así que un campo en blanco se deja como estaba.
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
 * Genera una clave nueva y se la asigna al proyecto en el mismo paso.
 *
 * Son dos llamadas porque la API separa crear de asignar: una clave puede
 * existir sin proyecto. Si la segunda falla, la clave queda creada y sin
 * asignar, así que se dice en vez de dejar un huérfano silencioso.
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
  // Los datos ya enviados no se borran: son el histórico.
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
