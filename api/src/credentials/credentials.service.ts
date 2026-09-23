import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CredentialKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../common/crypto.service';
import type { CreateCredentialDto } from './dto/create-credential.dto';

/** What can be returned from a credential. Never the ciphertext. */
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
   * Creates the key a project will send its metrics with.
   *
   * The plaintext value is returned **only once**: it's stored encrypted and
   * there's no way to recover it. If it's lost, a new one is generated — that's
   * safer than keeping it somewhere "just in case".
   */
  async create(dto: CreateCredentialDto) {
    // 32 bytes of randomness: enough that guessing makes no sense.
    const secret = dto.secret ?? randomBytes(32).toString('base64url');
    const sealed = this.crypto.seal(secret);

    const credential = await this.prisma.credential.create({
      data: { kind: CredentialKind.API_KEY, label: dto.label, ...sealed },
      select: PUBLIC,
    });

    return { ...credential, secret, notice: 'Guárdala ahora: no se puede volver a consultar.' };
  }

  /** Assigns the key to a project; from then on that project can send. */
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
    // Data already sent is NOT deleted: it's the history.
    return { revoked: true, note: 'Los datos ya enviados se conservan' };
  }
}
