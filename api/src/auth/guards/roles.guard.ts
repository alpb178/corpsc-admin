import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Enum-based role guard, not an `isAdmin` boolean like in tu-chamba: the hub
 * shows client data and we need to be able to grant read-only access without
 * also handing over credential management.
 *
 * Always goes AFTER JwtAuthGuard: @UseGuards(JwtAuthGuard, RolesGuard).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Without @Roles the route only requires being authenticated.
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) throw new ForbiddenException('No autenticado');

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Requiere rol ${required.join(' o ')}; tu rol es ${user.role}`,
      );
    }
    return true;
  }
}
