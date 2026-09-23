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
  it('lets the request through when the route declares no roles', () => {
    expect(guardRequiring(undefined).canActivate(contextWith(viewer))).toBe(true);
    expect(guardRequiring([]).canActivate(contextWith(viewer))).toBe(true);
  });

  it('lets the required role through', () => {
    expect(guardRequiring([Role.ADMIN]).canActivate(contextWith(admin))).toBe(true);
  });

  it('blocks users without the role', () => {
    expect(() => guardRequiring([Role.ADMIN]).canActivate(contextWith(viewer))).toThrow(
      ForbiddenException,
    );
  });

  it('accepts any of several allowed roles', () => {
    const guard = guardRequiring([Role.ADMIN, Role.ANALYST]);
    expect(guard.canActivate(contextWith(admin))).toBe(true);
    expect(() => guard.canActivate(contextWith(viewer))).toThrow(ForbiddenException);
  });

  it('blocks when there is no user on the request', () => {
    // Happens if someone uses RolesGuard without JwtAuthGuard in front: it must
    // shut the door, not leave it open.
    expect(() => guardRequiring([Role.VIEWER]).canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
