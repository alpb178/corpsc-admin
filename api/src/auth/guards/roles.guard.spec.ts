import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import type { AuthUser } from '../decorators/current-user.decorator';

function contextWith(user?: AuthUser) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as never;
}

function guardRequiring(roles: Role[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: () => roles } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const admin: AuthUser = { id: '1', email: 'a@corpsc.com', name: 'A', role: Role.ADMIN };
const viewer: AuthUser = { id: '2', email: 'v@corpsc.com', name: 'V', role: Role.VIEWER };

describe('RolesGuard', () => {
  it('deja pasar cuando la ruta no declara roles', () => {
    expect(guardRequiring(undefined).canActivate(contextWith(viewer))).toBe(true);
    expect(guardRequiring([]).canActivate(contextWith(viewer))).toBe(true);
  });

  it('deja pasar al rol exigido', () => {
    expect(guardRequiring([Role.ADMIN]).canActivate(contextWith(admin))).toBe(true);
  });

  it('bloquea a quien no tiene el rol', () => {
    expect(() => guardRequiring([Role.ADMIN]).canActivate(contextWith(viewer))).toThrow(
      ForbiddenException,
    );
  });

  it('acepta cualquiera de varios roles admitidos', () => {
    const guard = guardRequiring([Role.ADMIN, Role.ANALYST]);
    expect(guard.canActivate(contextWith(admin))).toBe(true);
    expect(() => guard.canActivate(contextWith(viewer))).toThrow(ForbiddenException);
  });

  it('bloquea si no hay usuario en la petición', () => {
    // Pasa si alguien pone RolesGuard sin JwtAuthGuard delante: debe cerrar la
    // puerta, no dejarla abierta.
    expect(() => guardRequiring([Role.VIEWER]).canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
