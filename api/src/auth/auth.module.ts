import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

// Los literales que acepta `ms` ('7d', '24h'…), más estrecho que string.
type ExpiresIn = NonNullable<NonNullable<JwtModuleOptions['signOptions']>['expiresIn']>;

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (): JwtModuleOptions => {
        const secret = process.env.JWT_SECRET;
        // Mejor caerse al arrancar que firmar tokens con `undefined` y
        // descubrirlo cuando alguien no pueda entrar.
        if (!secret) throw new Error('Falta JWT_SECRET');

        return {
          secret,
          // La variable de entorno llega como string suelto; el tipo es
          // más estrecho, de ahí el cast.
          signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as ExpiresIn },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // Se reexporta PassportModule: los módulos que usen JwtAuthGuard necesitan
  // el AuthModuleOptions que aporta, y basta con que importen AuthModule.
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
