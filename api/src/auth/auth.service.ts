import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { CreateUserDto } from './dto/create-user.dto';
import type { AuthUser } from './decorators/current-user.decorator';

const BCRYPT_ROUNDS = 12;

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.hubUser.findUnique({ where: { email: dto.email } });

    // Mismo mensaje tanto si el email no existe como si la contraseña falla:
    // distinguirlos convierte el login en un verificador de emails válidos.
    const invalid = new UnauthorizedException('Credenciales incorrectas');
    if (!user || !user.active) throw invalid;
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) throw invalid;

    await this.prisma.hubUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.sign({ id: user.id, email: user.email, name: user.name, role: user.role });
  }

  async createUser(dto: CreateUserDto): Promise<AuthUser> {
    const exists = await this.prisma.hubUser.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Ya existe un usuario con ese email');

    const user = await this.prisma.hubUser.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: dto.role ?? Role.VIEWER,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return user;
  }

  listUsers() {
    return this.prisma.hubUser.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private sign(user: AuthUser): AuthResult {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email }),
      user,
    };
  }
}
