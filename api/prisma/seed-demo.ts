/**
 * Datos SINTÉTICOS para desarrollo del panel.
 *
 * No son datos reales de ningún sitio: son cifras inventadas con forma
 * plausible (tendencia suave + ruido) para poder construir y revisar la
 * interfaz sin depender de que los proyectos estén enviando.
 *
 *   pnpm seed:demo
 *
 * Borra y regenera las métricas de los cuatro proyectos que toca. No ejecutar
 * jamás contra producción: sobrescribiría datos reales.
 *
 * Los desgloses se generan de modo que SUMEN el total, igual que hace un envío
 * real, para que la comprobación de coherencia del panel sirva de algo.
 */
import 'dotenv/config';
import { PrismaClient, RunStatus, RunTrigger } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const FROM = new Date('2026-08-01');
const DAYS = 62; // agosto y septiembre, para poder comparar periodos

const COUNTRIES = ['BO', 'AR', 'CL', 'PE', 'ES'];
const DEVICES = ['mobile', 'desktop', 'tablet'];
const PATHS = ['/', '/ofertas', '/empresas', '/blog'];

/** Qué mide cada proyecto: una tienda no publica ofertas de empleo. */
const PROFILES: Record<string, { business: string[]; currency?: string }> = {
  take: { business: ['orders', 'orders_paid', 'revenue', 'leads'], currency: 'USD' },
  'iris-natural': { business: ['orders', 'orders_paid', 'revenue'], currency: 'BOB' },
  'tu-chamba': { business: ['publications', 'leads', 'signups'] },
  invoices: { business: ['invoices', 'signups'] },
};

function rnd(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

async function main() {
  const slugs = Object.keys(PROFILES);
  const projects = await prisma.project.findMany({ where: { slug: { in: slugs } } });
  await prisma.metricDaily.deleteMany({ where: { projectId: { in: projects.map((p) => p.id) } } });

  let total = 0;

  for (const [pi, project] of projects.entries()) {
    const profile = PROFILES[project.slug];

    const run = await prisma.ingestionRun.create({
      data: {
        projectId: project.id,
        trigger: RunTrigger.BACKFILL,
        status: RunStatus.SUCCESS,
        windowFrom: FROM,
        windowTo: new Date(FROM.getTime() + DAYS * 86400000),
      },
    });

    const rows: Array<Record<string, unknown>> = [];

    for (let d = 0; d < DAYS; d++) {
      const date = new Date(FROM.getTime() + d * 86400000);
      const seed = pi * 1000 + d;
      const visits = Math.round((80 + pi * 40) * (1 + d / 120) * (0.8 + rnd(seed) * 0.4));

      const push = (metricKey: string, dimension: string, dimValue: string, value: number) => {
        if (value > 0) {
          rows.push({
            projectId: project.id,
            date,
            metricKey,
            dimension,
            dimValue,
            value,
            currency: metricKey === 'revenue' ? profile.currency : null,
            runId: run.id,
          });
        }
      };

      // Tráfico propio
      push('visits', 'total', '__total__', visits);
      push('page_views', 'total', '__total__', Math.round(visits * 2.6));

      // Desgloses que SUMAN el total
      let left = visits;
      COUNTRIES.forEach((c, i) => {
        const n = i === COUNTRIES.length - 1 ? left : Math.round(visits * [0.55, 0.18, 0.12, 0.09, 0.06][i]);
        left -= n;
        push('visits', 'country', c, n);
      });
      left = visits;
      DEVICES.forEach((c, i) => {
        const n = i === DEVICES.length - 1 ? left : Math.round(visits * [0.68, 0.28, 0.04][i]);
        left -= n;
        push('visits', 'device', c, n);
      });
      left = Math.round(visits * 2.6);
      PATHS.forEach((c, i) => {
        const n = i === PATHS.length - 1 ? left : Math.round(visits * 2.6 * [0.4, 0.3, 0.2, 0.1][i]);
        left -= n;
        push('page_views', 'path', c, n);
      });

      // Negocio, según el perfil del proyecto
      const orders = Math.round(visits * (0.03 + rnd(seed + 1) * 0.02));
      for (const key of profile.business) {
        switch (key) {
          case 'orders':
            push('orders', 'total', '__total__', orders);
            push('orders', 'status', 'paid', Math.max(0, orders - 2));
            push('orders', 'status', 'pending', Math.min(2, orders));
            break;
          case 'orders_paid':
            push('orders_paid', 'total', '__total__', Math.max(0, orders - 2));
            break;
          case 'revenue':
            push('revenue', 'total', '__total__', Math.round(orders * 145.5 * 100) / 100);
            break;
          case 'leads':
            push('leads', 'total', '__total__', Math.round(visits * 0.018));
            break;
          case 'signups':
            push('signups', 'total', '__total__', Math.round(visits * 0.012));
            break;
          case 'publications':
            push('publications', 'total', '__total__', Math.round(visits * 0.05));
            break;
          case 'invoices':
            push('invoices', 'total', '__total__', Math.round(visits * 0.02));
            break;
        }
      }
    }

    await prisma.metricDaily.createMany({ data: rows as never });
    // Los contadores del envío se cuadran a mano: aquí se escribe directo en
    // la tabla, sin pasar por el receptor que normalmente los rellena.
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { rowsWritten: rows.length },
    });
    await prisma.project.update({ where: { id: project.id }, data: { lastPushAt: new Date() } });
    total += rows.length;
  }

  console.log(`${total} filas en ${projects.length} proyectos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
