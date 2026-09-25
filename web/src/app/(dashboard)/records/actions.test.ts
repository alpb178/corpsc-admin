import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  apiWrite: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/dal', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiWrite: mocks.apiWrite,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { ApiError } from '@/lib/api';
import { deleteRow, describeDeletion, wipeProject } from './actions';

const input = { slug: 'take', table: 'page' as const, key: '/es', from: '2026-09-01', to: '2026-09-28' };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  mocks.requireRole.mockReset().mockResolvedValue({ role: 'ANALYST' });
  mocks.apiWrite.mockReset();
  mocks.revalidatePath.mockReset();
});

describe('deleteRow', () => {
  it('checks the role, calls the API with the row and the period, and refreshes everything', async () => {
    mocks.apiWrite.mockResolvedValue({ deletedEvents: 3, recomputedDays: 2, emptiedDays: 0, clearedDays: 1 });

    const result = await deleteRow(input);

    expect(mocks.requireRole).toHaveBeenCalledWith('ADMIN', 'ANALYST');
    expect(mocks.apiWrite).toHaveBeenCalledWith('/projects/take/records/rows', 'DELETE', {
      table: 'page',
      key: '/es',
      from: '2026-09-01',
      to: '2026-09-28',
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(result.ok).toBe('Borrados 3 eventos · 2 días recalculados · en 1 día sin eventos crudos solo se quitó la fila y sus totales no cambian.');
  });

  it('refuses what is incomplete or out of order before touching the API', async () => {
    await expect(deleteRow({ ...input, key: '' })).resolves.toEqual({ error: 'Falta qué borrar.' });
    await expect(deleteRow({ ...input, table: 'nope' as never })).resolves.toEqual({ error: 'Falta qué borrar.' });
    await expect(deleteRow({ ...input, from: '2026-09-30' })).resolves.toEqual({ error: 'El periodo no es válido.' });
    expect(mocks.apiWrite).not.toHaveBeenCalled();
  });

  it("passes the API's message on, and a plain one for anything else", async () => {
    mocks.apiWrite.mockRejectedValueOnce(new ApiError(404, 'No existe el proyecto "take"'));
    await expect(deleteRow(input)).resolves.toEqual({ error: 'No existe el proyecto "take"' });

    mocks.apiWrite.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(deleteRow(input)).resolves.toEqual({ error: 'No se pudo borrar.' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('is stopped by the role check', async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error('NEXT_REDIRECT /'));
    await expect(deleteRow(input)).rejects.toThrow('NEXT_REDIRECT');
    expect(mocks.apiWrite).not.toHaveBeenCalled();
  });
});

describe('describeDeletion', () => {
  it('reads one event in the singular and leaves out what did not happen', async () => {
    await expect(describeDeletion({ deletedEvents: 1, recomputedDays: 1, emptiedDays: 0, clearedDays: 0 })).resolves.toBe(
      'Borrado 1 evento · 1 día recalculado.',
    );
    await expect(describeDeletion({ deletedEvents: 0, recomputedDays: 0, emptiedDays: 0, clearedDays: 0 })).resolves.toBe(
      'Borrados 0 eventos.',
    );
  });
});

describe('wipeProject', () => {
  const fields = { slug: 'take', name: 'Take', confirm: 'Take' };

  it('needs the name typed exactly', async () => {
    await expect(wipeProject({}, form({ ...fields, confirm: 'take' }))).resolves.toEqual({
      error: 'Escribe exactamente «Take» para confirmar.',
    });
    await expect(wipeProject({}, form({ slug: 'take', confirm: 'x' }))).resolves.toEqual({ error: 'Falta el proyecto.' });
    expect(mocks.apiWrite).not.toHaveBeenCalled();
  });

  it('wipes the project and says what went', async () => {
    mocks.apiWrite.mockResolvedValue({ events: 120, metrics: 900, visitorDays: 40, runs: 7 });

    const result = await wipeProject({}, form({ ...fields, confirm: ' Take ' }));

    expect(mocks.apiWrite).toHaveBeenCalledWith('/projects/take/records', 'DELETE');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(result.ok).toBe('Eliminados 120 eventos, 900 filas de métricas, 40 visitantes-día y 7 envíos de Take.');
  });

  it('reports a failure', async () => {
    mocks.apiWrite.mockRejectedValueOnce(new ApiError(403, 'Requiere rol ADMIN o ANALYST'));
    await expect(wipeProject({}, form(fields))).resolves.toEqual({ error: 'Requiere rol ADMIN o ANALYST' });
    mocks.apiWrite.mockRejectedValueOnce(new Error('boom'));
    await expect(wipeProject({}, form(fields))).resolves.toEqual({ error: 'No se pudo eliminar.' });
  });
});
