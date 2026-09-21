import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Falta JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * El rol se lee de la base en cada petición, no del token: si a alguien se
   * le baja el rol o se le desactiva, el cambio surte efecto de inmediato en
   * lugar de esperar a que caduque su JWT.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.hubUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, active: true },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuario inexistente o desactivado');
    }

    const { active: _active, ...authUser } = user;
    return authUser;
  }
}
