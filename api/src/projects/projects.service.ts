import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeInactive = false) {
    return this.prisma.project.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true, slug: true, name: true, domain: true, kind: true,
        timezone: true, currency: true, active: true, sortOrder: true,
        lastPushAt: true,
        // Only whether it has a key assigned, never the key.
        credentialId: true,
      },
    });
  }

  async findBySlug(slug: string) {
    const project = await this.prisma.project.findUnique({
      where: { slug },
      include: {
        // Never the ciphertext: just enough to know which key it has
        // assigned and whether it's still the same one.
        credential: { select: { id: true, label: true, fingerprint: true } },
      },
    });

    if (!project) throw new NotFoundException(`No existe el proyecto "${slug}"`);
    return project;
  }

  async update(slug: string, dto: UpdateProjectDto) {
    if (dto.timezone && !this.isValidTimezone(dto.timezone)) {
      throw new BadRequestException(`Zona horaria desconocida: ${dto.timezone}`);
    }

    await this.findBySlug(slug);
    return this.prisma.project.update({
      where: { slug },
      data: dto,
    });
  }

  /** Checks the timezone against the runtime's ICU, not against a list of our own. */
  private isValidTimezone(tz: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }
}
