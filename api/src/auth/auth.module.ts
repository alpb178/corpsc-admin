import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

// The literals `ms` accepts ('7d', '24h'…), narrower than string.
type ExpiresIn = NonNullable<NonNullable<JwtModuleOptions['signOptions']>['expiresIn']>;

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (): JwtModuleOptions => {
        const secret = process.env.JWT_SECRET;
        // Better to crash on boot than to sign tokens with `undefined` and
        // find out when someone can't log in.
        if (!secret) throw new Error('Falta JWT_SECRET');

        return {
          secret,
          // The env variable arrives as a plain string; the type is
          // narrower, hence the cast.
          signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as ExpiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // PassportModule is re-exported: modules that use JwtAuthGuard need the
  // AuthModuleOptions it provides, and importing AuthModule is then enough.
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
