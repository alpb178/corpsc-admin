import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * Guard de rol basado en enum, no en un booleano `isAdmin` como en tu-chamba:
 * el hub muestra datos de clientes y hace falta poder dar acceso de solo
 * lectura sin entregar también la gestión de credenciales.
 *
 * Va siempre DESPUÉS de JwtAuthGuard: @UseGuards(JwtAuthGuard, RolesGuard).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles la ruta solo exige estar autenticado.
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
