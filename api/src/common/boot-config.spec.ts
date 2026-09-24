import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Better to crash on boot than to sign tokens with `undefined` or to find out
 * about a missing database on the first request.
 */
describe('boot configuration', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses to start the JWT strategy without a secret', () => {
    delete process.env.JWT_SECRET;
    expect(() => new JwtStrategy({} as PrismaService)).toThrow('Falta JWT_SECRET');
  });

  it('refuses to start Prisma without a database URL', () => {
    delete process.env.DATABASE_URL;
    expect(() => new PrismaService()).toThrow('Falta DATABASE_URL');
  });
});
