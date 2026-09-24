/**
 * Hub seed: the corporate site, the four products and the metrics.
 *
 * The canonical project registry lives in
 * corpsc-portfolio/src/content/projects.ts; this file is its mirror. If a site
 * is added there, it has to be added here — they share the `slug`.
 *
 * Only the five ecosystem sites are here. The rest of the portfolio catalog
 * (HumanCore, the client sites…) doesn't belong to it and was removed from
 * the hub on 2026-09-22.
 *
 * It's idempotent: `upsert` by slug/key, so it can be run again without
 * duplicating anything or overwriting settings someone changed from the panel.
 */
import 'dotenv/config';
import { PrismaClient, ProjectKind, MetricUnit, Aggregation, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface ProjectSeed {
  slug: string;
  name: string;
  domain: string;
  kind: ProjectKind;
}

const PROJECTS: ProjectSeed[] = [
  // The corporate site. It isn't one of the catalog's products: it's the
  // showcase that presents them, which is why its useful metric isn't orders
  // but which group site gets the click. It has no database to aggregate in,
  // so it sends events (docs/envio-de-metricas/eventos.md).
  { slug: 'corpsc',       name: 'CORPSC',       domain: 'www.corpsc.com',        kind: ProjectKind.OWN },

  // CORPSC's own products
  { slug: 'take',         name: 'Take',         domain: 'take.corpsc.com',       kind: ProjectKind.OWN },
  { slug: 'invoices',     name: 'Invoices',     domain: 'invoices.corpsc.com',   kind: ProjectKind.OWN },
  { slug: 'iris-natural', name: 'Iris Natural', domain: 'irisnatural.corpsc.com', kind: ProjectKind.OWN },
  { slug: 'tu-chamba',    name: 'Tu Chamba',    domain: 'tu-chamba.corpsc.com',  kind: ProjectKind.OWN },
];

interface MetricSeed {
  key: string;
  label: string;
  labelEn: string;
  unit: MetricUnit;
  aggregation?: Aggregation;
  derivedFrom?: { numerator: string; denominator: string };
  sortOrder: number;
}

// Catalog of what the projects send.
//
// Only ADDITIVE measures. Those with `derivedFrom` are never stored: they're
// computed at read time, because a rate or an average can't be summed across
// days without falsifying the number.
//
// A project may send metrics that aren't listed here: they register
// themselves, deactivated, until someone decides what they're called.
const METRICS: MetricSeed[] = [
  // ── Traffic, from each site's own logging ──
  //
  // There are no "unique visitors": summing each day's uniques counts a
  // returning visitor several times, and daily data can't tell how many
  // different people there were in a month. Showing an inflated number would
  // be worse than not showing it. `visits` IS summable: someone who comes
  // back on three days made three visits.
  { key: 'visits',        label: 'Visitas',          labelEn: 'Visits',      unit: MetricUnit.COUNT, sortOrder: 10 },
  // Additive, unlike unique visitors: someone is new only once, on one day.
  // Unique visitors are counted at read time from `visitor_daily`.
  { key: 'new_visitors',  label: 'Visitantes nuevos', labelEn: 'New visitors', unit: MetricUnit.COUNT, sortOrder: 15 },
  { key: 'page_views',    label: 'Páginas vistas',   labelEn: 'Page views',  unit: MetricUnit.COUNT, sortOrder: 20 },
  { key: 'sessions',      label: 'Sesiones',         labelEn: 'Sessions',    unit: MetricUnit.COUNT, sortOrder: 30 },

  // ── Business ──
  { key: 'product_views', label: 'Productos vistos', labelEn: 'Product views', unit: MetricUnit.COUNT, sortOrder: 60 },
  { key: 'add_to_cart',   label: 'Añadidos al carrito', labelEn: 'Add to cart', unit: MetricUnit.COUNT, sortOrder: 70 },
  { key: 'ad_views',      label: 'Anuncios vistos',  labelEn: 'Ad views',    unit: MetricUnit.COUNT,    sortOrder: 80 },
  { key: 'clicks',        label: 'Clics',            labelEn: 'Clicks',      unit: MetricUnit.COUNT, sortOrder: 85 },
  { key: 'site_clicks',   label: 'Clics a otros sitios', labelEn: 'Site clicks', unit: MetricUnit.COUNT, sortOrder: 90 },
  { key: 'custom_events', label: 'Eventos personalizados', labelEn: 'Custom events', unit: MetricUnit.COUNT, sortOrder: 95 },
  // Custom events a project marks as goals in `conversion_goal`.
  { key: 'conversions',   label: 'Conversiones',     labelEn: 'Conversions', unit: MetricUnit.COUNT, sortOrder: 105 },

  { key: 'orders',        label: 'Pedidos',          labelEn: 'Orders',      unit: MetricUnit.COUNT,    sortOrder: 110 },
  { key: 'orders_paid',   label: 'Pedidos cobrados', labelEn: 'Paid orders', unit: MetricUnit.COUNT,    sortOrder: 120 },
  { key: 'orders_cancelled', label: 'Pedidos cancelados', labelEn: 'Cancelled orders', unit: MetricUnit.COUNT, sortOrder: 125 },
  { key: 'revenue',       label: 'Ingresos',         labelEn: 'Revenue',     unit: MetricUnit.CURRENCY, sortOrder: 130 },
  { key: 'leads',         label: 'Contactos',        labelEn: 'Leads',       unit: MetricUnit.COUNT,    sortOrder: 140 },
  { key: 'signups',       label: 'Altas',            labelEn: 'Signups',     unit: MetricUnit.COUNT,    sortOrder: 150 },
  { key: 'publications',  label: 'Publicaciones',    labelEn: 'Publications',unit: MetricUnit.COUNT,    sortOrder: 160 },
  { key: 'invoices',      label: 'Facturas',         labelEn: 'Invoices',    unit: MetricUnit.COUNT,    sortOrder: 170 },

  // ── Derived: NOT persisted ──
  { key: 'pages_per_visit', label: 'Páginas por visita', labelEn: 'Pages per visit', unit: MetricUnit.RATIO,
    aggregation: Aggregation.WEIGHTED_AVG, derivedFrom: { numerator: 'page_views', denominator: 'visits' }, sortOrder: 50 },
  { key: 'conversion_rate', label: 'Tasa de conversión', labelEn: 'Conversion rate', unit: MetricUnit.RATIO,
    aggregation: Aggregation.WEIGHTED_AVG, derivedFrom: { numerator: 'orders', denominator: 'visits' }, sortOrder: 180 },
  { key: 'lead_rate',       label: 'Tasa de contacto',   labelEn: 'Lead rate',       unit: MetricUnit.RATIO,
    aggregation: Aggregation.WEIGHTED_AVG, derivedFrom: { numerator: 'leads', denominator: 'visits' }, sortOrder: 190 },
];

async function seedProjects(): Promise<void> {
  for (const [index, p] of PROJECTS.entries()) {
    await prisma.project.upsert({
      where: { slug: p.slug },
      // Only identity data is refreshed. `timezone`, `currency`, `active` and
      // `sortOrder` are left as they are: they're settings editable from the
      // panel and re-seeding must not undo them.
      update: { name: p.name, domain: p.domain, kind: p.kind },
      create: { ...p, sortOrder: (index + 1) * 10 },
    });
  }
  console.log(`  ✓ ${PROJECTS.length} proyectos`);
}

async function seedMetricDefinitions(): Promise<void> {
  for (const m of METRICS) {
    const data = {
      label: m.label,
      labelEn: m.labelEn,
      unit: m.unit,
      aggregation: m.aggregation ?? Aggregation.SUM,
      derivedFrom: m.derivedFrom ?? undefined,
      sortOrder: m.sortOrder,
      // The ones in this list are the ones the hub knows, so they're activated
      // even if ingestion discovered them earlier and registered them as
      // inactive. Unlike a project's settings, nobody edits the metric catalog
      // from the panel.
      active: true,
    };
    await prisma.metricDefinition.upsert({
      where: { key: m.key },
      update: data,
      create: { key: m.key, ...data },
    });
  }
  const derived = METRICS.filter((m) => m.derivedFrom).length;
  console.log(`  ✓ ${METRICS.length} métricas (${derived} derivadas, no se persisten)`);
}

/**
 * Creates the first ADMIN only if there's none and the variables were passed.
 * There's never a default password in the code: a hub with client data and a
 * seeded admin/admin is an incident waiting to happen.
 */
async function seedAdmin(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    const count = await prisma.hubUser.count();
    if (count === 0) {
      console.log(
        '  ! Sin usuarios. Para crear el primer admin:\n' +
          '      SEED_ADMIN_EMAIL=tu@corpsc.com SEED_ADMIN_PASSWORD=<10+ chars> pnpm seed',
      );
    }
    return;
  }

  if (password.length < 10) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 10 caracteres');
  }

  await prisma.hubUser.upsert({
    where: { email },
    update: { role: Role.ADMIN, active: true },
    create: {
      email,
      name: email.split('@')[0],
      passwordHash: await bcrypt.hash(password, 12),
      role: Role.ADMIN,
    },
  });
  console.log(`  ✓ admin ${email}`);
}

async function main(): Promise<void> {
  console.log('Sembrando el hub…');
  await seedProjects();
  await seedMetricDefinitions();
  await seedAdmin();
  console.log('Listo.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
