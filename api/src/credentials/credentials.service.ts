import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CredentialKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import type { CreateCredentialDto } from './dto/create-credential.dto';

/** Lo que se puede devolver de una credencial. Nunca el ciphertext. */
const PUBLIC = {
  id: true,
  kind: true,
  label: true,
  fingerprint: true,
  createdAt: true,
} as const;

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  list() {
    return this.prisma.credential.findMany({
      select: { ...PUBLIC, projects: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Crea la clave con la que un proyecto enviará sus métricas.
   *
   * El valor en claro se devuelve **una sola vez**: en la base queda cifrado y
   * no hay forma de recuperarlo. Si se pierde, se genera otra — es más seguro
   * que guardarlo en algún sitio "por si acaso".
   */
  async create(dto: CreateCredentialDto) {
    // 32 bytes de aleatoriedad: suficiente para que no tenga sentido probar.
    const secret = dto.secret ?? randomBytes(32).toString('base64url');
    const sealed = this.crypto.seal(secret);

    const credential = await this.prisma.credential.create({
      data: { kind: CredentialKind.API_KEY, label: dto.label, ...sealed },
      select: PUBLIC,
    });

    return { ...credential, secret, notice: 'Guárdala ahora: no se puede volver a consultar.' };
  }

  /** Asigna la clave a un proyecto; a partir de ahí ese proyecto puede enviar. */
  async assign(slug: string, credentialId: string) {
    const [project, credential] = await Promise.all([
      this.prisma.project.findUnique({ where: { slug } }),
      this.prisma.credential.findUnique({ where: { id: credentialId } }),
    ]);

    if (!project) throw new NotFoundException(`No existe el proyecto "${slug}"`);
    if (!credential) throw new NotFoundException('La credencial indicada no existe');

    return this.prisma.project.update({
      where: { slug },
      data: { credentialId },
      select: { slug: true, name: true, credential: { select: PUBLIC } },
    });
  }

  async revoke(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug } });
    if (!project) throw new NotFoundException(`No existe el proyecto "${slug}"`);

    await this.prisma.project.update({ where: { slug }, data: { credentialId: null } });
    // Los datos ya enviados NO se borran: son el histórico.
    return { revoked: true, note: 'Los datos ya enviados se conservan' };
  }
}
