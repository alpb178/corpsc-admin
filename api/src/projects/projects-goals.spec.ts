import 'dotenv/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaClient, ProjectKind } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ProjectsService } from './projects.service';
import type { PrismaService } from '../prisma/prisma.service';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const service = new ProjectsService(prisma as unknown as PrismaService);

const SLUG = 'test-projects-goals';
let projectId: string;

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  ({ id: projectId } = await prisma.project.create({
    data: { slug: SLUG, name: 'Goals', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN },
    select: { id: true },
  }));
});

beforeEach(async () => {
  await prisma.conversionGoal.deleteMany({ where: { projectId } });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('conversion goals', () => {
  it('creates a goal, active by default', async () => {
    const goal = await service.upsertGoal(SLUG, 'contact_submit', { label: 'Formulario de contacto' });

    expect(goal).toMatchObject({ eventName: 'contact_submit', label: 'Formulario de contacto', active: true });
    expect(await service.listGoals(SLUG)).toHaveLength(1);
  });

  it('renames or pauses an existing goal without duplicating it', async () => {
    await service.upsertGoal(SLUG, 'contact_submit', { label: 'Contacto' });
    await service.upsertGoal(SLUG, 'contact_submit', { label: 'Formulario', active: false });
    // Only the label: the pause stays.
    const goal = await service.upsertGoal(SLUG, 'contact_submit', { label: 'Formulario de contacto' });

    expect(goal).toMatchObject({ label: 'Formulario de contacto', active: false });
    expect(await service.listGoals(SLUG)).toHaveLength(1);
  });

  it('lists goals by event name', async () => {
    await service.upsertGoal(SLUG, 'whatsapp_order', { label: 'Pedido por WhatsApp' });
    await service.upsertGoal(SLUG, 'add_to_cart', { label: 'Añadido al carrito' });

    expect((await service.listGoals(SLUG)).map((g) => g.eventName)).toEqual(['add_to_cart', 'whatsapp_order']);
  });

  it('rejects an event name the sites could never send', async () => {
    await expect(service.upsertGoal(SLUG, 'Contact Submit', { label: 'x' })).rejects.toThrow(BadRequestException);
  });

  it('deletes a goal, and says so when there was none', async () => {
    await service.upsertGoal(SLUG, 'contact_submit', { label: 'Contacto' });

    await service.deleteGoal(SLUG, 'contact_submit');
    expect(await service.listGoals(SLUG)).toEqual([]);
    await expect(service.deleteGoal(SLUG, 'contact_submit')).rejects.toThrow(NotFoundException);
  });

  it('rejects an unknown project', async () => {
    await expect(service.listGoals('test-projects-goals-nope')).rejects.toThrow(NotFoundException);
  });
});
