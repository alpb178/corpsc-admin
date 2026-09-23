import 'dotenv/config';
import { PrismaClient, ProjectKind, SiteEventType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { EventRollupService, elementKey } from './event-rollup.service';
import { FactWriterService } from './fact-writer.service';
import { toUtcDate } from './common/dates';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Tests contra Postgres de verdad: lo que se prueba —el recorte del día en la
 * zona del proyecto y el conteo de sesiones distintas— vive en SQL, así que
 * con un mock no se estaría probando nada.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const service = new EventRollupService(
  prisma as unknown as PrismaService,
  new FactWriterService(prisma as unknown as PrismaService),
);

const SLUG = 'test-event-rollup';
/** La Paz es UTC−4: un evento de las 01:00 UTC todavía es del día anterior. */
const TZ = 'America/La_Paz';
const FROM = '2026-03-01';
const TO = '2026-03-02';

let project: { id: string; slug: string; timezone: string };

interface EventSeed {
  type: SiteEventType;
  sessionId: string;
  at: string;
  path?: string;
  target?: string;
  linkType?: string;
  section?: string;
  label?: string;
  country?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

async function seedEvents(events: EventSeed[]): Promise<void> {
  await prisma.siteEvent.createMany({
    data: events.map((e) => ({
      projectId: project.id,
      type: e.type,
      sessionId: e.sessionId,
      path: e.path ?? '/es',
      target: e.target ?? null,
      linkType: e.linkType ?? null,
      section: e.section ?? null,
      label: e.label ?? null,
      country: e.country ?? null,
      referrer: e.referrer ?? null,
      utmSource: e.utmSource ?? null,
      utmMedium: e.utmMedium ?? null,
      utmCampaign: e.utmCampaign ?? null,
      occurredAt: new Date(e.at),
    })),
  });
}

function stored() {
  return prisma.metricDaily.findMany({
    where: { projectId: project.id },
    orderBy: [{ date: 'asc' }, { metricKey: 'asc' }, { dimValue: 'asc' }],
    select: { date: true, metricKey: true, dimension: true, dimValue: true, value: true },
  });
}

async function valueOf(metricKey: string, dimValue = '__total__'): Promise<number | null> {
  const row = (await stored()).find((r) => r.metricKey === metricKey && r.dimValue === dimValue);
  return row ? Number(row.value) : null;
}

beforeAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  project = await prisma.project.create({
    data: { slug: SLUG, name: 'Test eventos', domain: `${SLUG}.invalid`, kind: ProjectKind.OWN, timezone: TZ },
    select: { id: true, slug: true, timezone: true },
  });
});

beforeEach(async () => {
  await prisma.siteEvent.deleteMany({ where: { projectId: project.id } });
  await prisma.metricDaily.deleteMany({ where: { projectId: project.id } });
  await prisma.ingestionRun.deleteMany({ where: { projectId: project.id } });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('consolidación de eventos', () => {
  it('cuenta una visita por sesión, no por página vista', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:02:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:05:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-dos-bbbb', at: '2026-03-01T18:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits')).toBe(2);
    expect(await valueOf('page_views')).toBe(4);
  });

  it('recorta el día en la zona del proyecto, no en UTC', async () => {
    await seedEvents([
      // 01:00 UTC del día 2 son las 21:00 del día 1 en La Paz.
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-tarde-aa', at: '2026-03-02T01:00:00Z' },
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-manana-b', at: '2026-03-02T14:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    // Solo la fila agregada: el desglose por ruta trae las mismas cifras otra vez.
    const rows = (await stored()).filter(
      (r) => r.metricKey === 'page_views' && r.dimension === 'total',
    );
    expect(rows.map((r) => [r.date.toISOString().slice(0, 10), Number(r.value)])).toEqual([
      ['2026-03-01', 1],
      ['2026-03-02', 1],
    ]);
  });

  it('desglosa los clics por proyecto de destino y por tipo de enlace', async () => {
    await seedEvents([
      { type: SiteEventType.SITE_CLICK, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z', target: 'take', linkType: 'web' },
      { type: SiteEventType.SITE_CLICK, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:01:00Z', target: 'take', linkType: 'web' },
      { type: SiteEventType.SITE_CLICK, sessionId: 'sesion-dos-bbbb', at: '2026-03-01T16:00:00Z', target: 'iris-natural', linkType: 'android' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('site_clicks')).toBe(3);
    expect(await valueOf('site_clicks', 'take')).toBe(2);
    expect(await valueOf('site_clicks', 'iris-natural')).toBe(1);
    expect(await valueOf('site_clicks', 'android')).toBe(1);
    expect(await valueOf('site_clicks', 'web')).toBe(2);
  });

  it('reconsolidar la misma ventana no duplica ni deja rastro del anterior', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO);

    // Llega un evento con retraso y se vuelve a consolidar el mismo día.
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-dos-bbbb', at: '2026-03-01T16:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('page_views')).toBe(2);
    expect((await stored()).filter((r) => r.metricKey === 'page_views' && r.dimension === 'total')).toHaveLength(1);
  });

  it('no toca las métricas que no son suyas', async () => {
    // Un proyecto que además empuja sus pedidos: la consolidación solo manda
    // sobre visitas, páginas y clics.
    await prisma.metricDaily.create({
      data: {
        projectId: project.id,
        date: toUtcDate(FROM),
        metricKey: 'orders',
        dimension: 'total',
        dimValue: '__total__',
        value: 7,
      },
    });
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('orders')).toBe(7);
  });

  it('sin eventos no escribe nada: el silencio no es un cero', async () => {
    const result = await service.rollupWindow(project, FROM, TO);

    expect(result).toBeNull();
    expect(await stored()).toHaveLength(0);
    expect(await prisma.ingestionRun.count({ where: { projectId: project.id } })).toBe(0);
  });
});

describe('clics dentro de la página', () => {
  it('cuenta los clics por página y por elemento, incluidos los que salen', async () => {
    await seedEvents([
      { type: SiteEventType.CLICK, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z', path: '/es', section: 'hero', label: 'Ver proyectos' },
      { type: SiteEventType.CLICK, sessionId: 'sesion-dos-bbbb', at: '2026-03-01T15:10:00Z', path: '/es', section: 'hero', label: 'Ver proyectos' },
      { type: SiteEventType.CLICK, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:20:00Z', path: '/es/contacto', section: 'footer', label: 'Email' },
      { type: SiteEventType.SITE_CLICK, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:30:00Z', path: '/es', section: 'projects', label: 'Take', target: 'take', linkType: 'web' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('clicks')).toBe(4);
    expect(await valueOf('site_clicks')).toBe(1);
    expect(await valueOf('clicks', '/es')).toBe(3);
    expect(await valueOf('clicks', '/es | hero | Ver proyectos')).toBe(2);
    expect(await valueOf('clicks', '/es | projects | Take')).toBe(1);
    expect(await valueOf('clicks', '/es/contacto | footer | Email')).toBe(1);
  });

  it('un clic a otro sitio sin sección cuenta en el total pero no en el desglose', async () => {
    await seedEvents([
      { type: SiteEventType.SITE_CLICK, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z', target: 'take', linkType: 'web' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('clicks')).toBe(1);
    const elements = (await stored()).filter((r) => r.dimension === 'element');
    expect(elements).toHaveLength(0);
  });

  it('quita la barra de las partes para que el valor se pueda volver a partir', () => {
    expect(elementKey('/es', 'nav | top', 'A|B')).toBe('/es | nav / top | A/B');
  });
});

describe('de dónde y cuándo llegan las visitas', () => {
  const PV = SiteEventType.PAGE_VIEW;

  it('toma país, fuente y hora del primer evento de cada visita', async () => {
    await seedEvents([
      // 14:00 UTC son las 10:00 en La Paz.
      { type: PV, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T14:00:00Z', country: 'BO', referrer: 'google.com' },
      // La segunda página de la misma visita no trae procedencia: no cuenta otra vez.
      { type: PV, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T14:05:00Z', country: 'BO' },
      { type: PV, sessionId: 'sesion-dos-bbbb', at: '2026-03-01T22:30:00Z', country: 'AR',
        utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'otono' },
      { type: PV, sessionId: 'sesion-tres-ccc', at: '2026-03-01T22:40:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    expect(await valueOf('visits')).toBe(3);
    expect(await valueOf('visits', 'BO')).toBe(1);
    expect(await valueOf('visits', 'AR')).toBe(1);
    expect(await valueOf('visits', '__unknown__')).toBe(1);
    expect(await valueOf('visits', 'Organic Search')).toBe(1);
    expect(await valueOf('visits', 'Organic Social')).toBe(1);
    expect(await valueOf('visits', 'Direct')).toBe(1);
    expect(await valueOf('visits', 'google.com')).toBe(1);
    expect(await valueOf('visits', 'instagram')).toBe(1);
    expect(await valueOf('visits', '__direct__')).toBe(1);
    expect(await valueOf('visits', 'otono')).toBe(1);
    expect(await valueOf('visits', '10')).toBe(1);
    expect(await valueOf('visits', '18')).toBe(2);
    expect(await valueOf('page_views', '10')).toBe(2);
  });

  it('cada desglose de visitas suma el total', async () => {
    await seedEvents([
      { type: PV, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T14:00:00Z', country: 'BO', referrer: 'google.com' },
      { type: PV, sessionId: 'sesion-dos-bbbb', at: '2026-03-01T15:00:00Z' },
    ]);

    await service.rollupWindow(project, FROM, TO);

    const rows = await stored();
    const sum = (dimension: string) =>
      rows
        .filter((r) => r.metricKey === 'visits' && r.dimension === dimension)
        .reduce((acc, r) => acc + Number(r.value), 0);
    for (const dimension of ['country', 'channel', 'source', 'hour']) {
      expect(sum(dimension), dimension).toBe(2);
    }
  });
});

describe('consolidación en vivo', () => {
  const runs = () => prisma.ingestionRun.findMany({ where: { projectId: project.id } });

  it('reutiliza el registro de su ventana en vez de dejar uno por visita', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO, { live: true });

    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-dos-bbbb', at: '2026-03-01T16:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO, { live: true });

    expect(await runs()).toHaveLength(1);
    expect(await valueOf('visits')).toBe(2);
  });

  it('la de la noche sigue dejando su propio registro', async () => {
    await seedEvents([
      { type: SiteEventType.PAGE_VIEW, sessionId: 'sesion-uno-aaaa', at: '2026-03-01T15:00:00Z' },
    ]);
    await service.rollupWindow(project, FROM, TO, { live: true });
    await service.rollupWindow(project, FROM, TO);

    expect(await runs()).toHaveLength(2);
  });

  it('agrupa una ráfaga de envíos en una sola consolidación', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(service, 'rollupWindow').mockResolvedValue(null);
    try {
      service.scheduleLive(project);
      service.scheduleLive(project);
      service.scheduleLive(project);
      expect(spy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('lo que llega durante una consolidación deja otra para después', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const spy = vi
      .spyOn(service, 'rollupWindow')
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(null))))
      .mockResolvedValue(null);
    try {
      service.scheduleLive(project);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Llega un evento mientras la primera sigue en marcha.
      service.scheduleLive(project);
      release();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});
