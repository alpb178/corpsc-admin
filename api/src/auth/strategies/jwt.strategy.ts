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
   * The role is read from the database on every request, not from the token:
   * if someone is downgraded or deactivated, the change takes effect
   * immediately instead of waiting for their JWT to expire.
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
