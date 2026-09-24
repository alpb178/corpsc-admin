import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateProjectDto } from './dto/update-project.dto';
import type { UpsertGoalDto } from './dto/upsert-goal.dto';
import { EVENT_NAME } from '../ingestion/site-events.contract';

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

  // ─────────────────────────── Conversion goals ───────────────────────────
  //
  // Which custom events count as conversions. It's configuration, not data:
  // changing it takes effect on the next rollup, without redeploying the site.
  // The rollup rewrites the last days, so a goal added today counts from
  // today and yesterday; older days keep what they had until someone rolls
  // them up again (`pnpm rollup`).

  async listGoals(slug: string) {
    const project = await this.findBySlug(slug);
    return this.prisma.conversionGoal.findMany({
      where: { projectId: project.id },
      orderBy: { eventName: 'asc' },
      select: { eventName: true, label: true, active: true, createdAt: true, updatedAt: true },
    });
  }

  async upsertGoal(slug: string, eventName: string, dto: UpsertGoalDto) {
    if (!EVENT_NAME.test(eventName)) {
      throw new BadRequestException(
        'El nombre del evento debe ser snake_case, empezar por letra y tener 2-64 caracteres',
      );
    }
    const project = await this.findBySlug(slug);
    return this.prisma.conversionGoal.upsert({
      where: { projectId_eventName: { projectId: project.id, eventName } },
      create: { projectId: project.id, eventName, label: dto.label, active: dto.active ?? true },
      update: { label: dto.label, ...(dto.active === undefined ? {} : { active: dto.active }) },
      select: { eventName: true, label: true, active: true, createdAt: true, updatedAt: true },
    });
  }

  async deleteGoal(slug: string, eventName: string): Promise<void> {
    const project = await this.findBySlug(slug);
    const { count } = await this.prisma.conversionGoal.deleteMany({
      where: { projectId: project.id, eventName },
    });
    if (count === 0) throw new NotFoundException(`"${slug}" no tiene el objetivo "${eventName}"`);
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
