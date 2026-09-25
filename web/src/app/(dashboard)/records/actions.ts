'use server';

import { revalidatePath } from 'next/cache';
import { apiWrite, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/dal';
import type { ActionResult, DeleteRowInput, DeleteRowsResult, WipeResult } from '@/lib/types';

const TABLES = new Set(['page', 'element', 'landing', 'exit', 'acquisition', 'recent']);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Deleting is for those who read the data for a living —analysts as well as
 * admins—, never for a viewer. Checked here before the API, which has the
 * last word: a Server Function runs as a POST against its own route, and
 * without this it would be open to anyone with a session.
 */
async function requireEditor(): Promise<void> {
  await requireRole('ADMIN', 'ANALYST');
}

function readable(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** How a deletion went, in words the table can show. */
export async function describeDeletion(result: DeleteRowsResult): Promise<string> {
  const parts = [
    result.deletedEvents === 1 ? 'Borrado 1 evento' : `Borrados ${result.deletedEvents} eventos`,
  ];
  if (result.recomputedDays > 0) parts.push(`${result.recomputedDays} ${result.recomputedDays === 1 ? 'día recalculado' : 'días recalculados'}`);
  if (result.clearedDays > 0) {
    parts.push(
      `en ${result.clearedDays} ${result.clearedDays === 1 ? 'día' : 'días'} sin eventos crudos solo se quitó la fila y sus totales no cambian`,
    );
  }
  return `${parts.join(' · ')}.`;
}

/** Deletes one row of a table: its raw events within the period, and recomputes the rest. */
export async function deleteRow(input: DeleteRowInput): Promise<ActionResult> {
  await requireEditor();

  const { slug, table, key, from, to } = input;
  if (!slug || !TABLES.has(table) || !key) return { error: 'Falta qué borrar.' };
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || from > to) return { error: 'El periodo no es válido.' };

  try {
    const result = await apiWrite<DeleteRowsResult>(`/projects/${encodeURIComponent(slug)}/records/rows`, 'DELETE', {
      table,
      key,
      from,
      to,
    });
    // Every figure on every page may have moved: the dashboard, the site, the records.
    revalidatePath('/', 'layout');
    return { ok: await describeDeletion(result) };
  } catch (error) {
    return { error: readable(error, 'No se pudo borrar.') };
  }
}

/**
 * Deletes everything a site ever sent. The form makes the person type the
 * site's name: a click on the wrong card must not be enough.
 */
export async function wipeProject(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireEditor();

  const slug = String(formData.get('slug') ?? '');
  const name = String(formData.get('name') ?? '');
  const typed = String(formData.get('confirm') ?? '').trim();
  if (!slug || !name) return { error: 'Falta el proyecto.' };
  if (typed !== name) return { error: `Escribe exactamente «${name}» para confirmar.` };

  try {
    const result = await apiWrite<WipeResult>(`/projects/${encodeURIComponent(slug)}/records`, 'DELETE');
    revalidatePath('/', 'layout');
    return {
      ok: `Eliminados ${result.events} eventos, ${result.metrics} filas de métricas, ${result.visitorDays} visitantes-día y ${result.runs} envíos de ${name}.`,
    };
  } catch (error) {
    return { error: readable(error, 'No se pudo eliminar.') };
  }
}
