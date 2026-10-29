import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  apiWrite: vi.fn(),
}));
vi.mock('@/lib/dal', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiWrite: mocks.apiWrite,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { ApiError } from '@/lib/api';
import { resetPassword } from './actions';

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  mocks.requireRole.mockReset().mockResolvedValue({ role: 'ADMIN' });
  mocks.apiWrite.mockReset();
});

describe('resetPassword', () => {
  it('checks for an admin before touching the API', async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error('NEXT_REDIRECT /'));
    await expect(resetPassword({}, form({ userId: 'u1', password: 'a-long-password' }))).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mocks.apiWrite).not.toHaveBeenCalled();
  });

  it('refuses a short password, or a missing user, before calling the API', async () => {
    await expect(resetPassword({}, form({ userId: '', password: 'a-long-password' }))).resolves.toEqual({
      error: 'Falta el usuario.',
    });
    await expect(resetPassword({}, form({ userId: 'u1', password: 'corta' }))).resolves.toEqual({
      error: 'La contraseña debe tener al menos 10 caracteres.',
    });
    expect(mocks.apiWrite).not.toHaveBeenCalled();
  });

  it('resets the password by id', async () => {
    mocks.apiWrite.mockResolvedValue(undefined);

    const result = await resetPassword({}, form({ userId: 'u1', password: 'a-long-password' }));

    expect(mocks.apiWrite).toHaveBeenCalledWith('/auth/users/u1/password', 'PATCH', { password: 'a-long-password' });
    expect(result).toEqual({ ok: 'Contraseña actualizada.' });
  });

  it("passes the API's message on, and a plain one for anything else", async () => {
    mocks.apiWrite.mockRejectedValueOnce(new ApiError(404, 'Usuario no encontrado'));
    await expect(resetPassword({}, form({ userId: 'ghost', password: 'a-long-password' }))).resolves.toEqual({
      error: 'Usuario no encontrado',
    });

    mocks.apiWrite.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(resetPassword({}, form({ userId: 'u1', password: 'a-long-password' }))).resolves.toEqual({
      error: 'No se pudo restablecer la contraseña.',
    });
  });
});
