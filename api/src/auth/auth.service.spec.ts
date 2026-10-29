import * as bcrypt from 'bcryptjs';
import { NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PrismaService } from '../prisma/prisma.service';

function service(user: { id: string; passwordHash: string } | null) {
  const prisma = {
    hubUser: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { auth: new AuthService(prisma as unknown as PrismaService, {} as never), prisma };
}

describe('AuthService.resetPassword', () => {
  it('hashes the new password and overwrites the old one, by id', async () => {
    const { auth, prisma } = service({ id: 'u1', passwordHash: 'old-hash' });

    await auth.resetPassword('u1', 'a-brand-new-password');

    expect(prisma.hubUser.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: expect.any(String) },
    });
    const newHash = prisma.hubUser.update.mock.calls[0][0].data.passwordHash;
    expect(newHash).not.toBe('old-hash');
    await expect(bcrypt.compare('a-brand-new-password', newHash)).resolves.toBe(true);
  });

  it('refuses a user id that does not exist, instead of hashing into nothing', async () => {
    const { auth, prisma } = service(null);

    await expect(auth.resetPassword('missing', 'whatever-password')).rejects.toThrow(NotFoundException);
    expect(prisma.hubUser.update).not.toHaveBeenCalled();
  });
});
