/**
 * Seed del hub: el sitio corporativo, los 14 del catálogo y las métricas.
 *
 * El registro canónico de proyectos vive en
 * corpsc-portfolio/src/content/projects.ts; este archivo es su espejo. Si allí
 * se añade un sitio, hay que añadirlo aquí — comparten el `slug`.
 *
 * Es idempotente: `upsert` por slug/key, así que se puede volver a ejecutar
 * sin duplicar ni pisar los ajustes que alguien haya cambiado desde el panel.
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
  // El sitio corporativo. No es uno de los catorce productos del catálogo: es
  // el escaparate que los enseña, y por eso su métrica útil no son los pedidos
  // sino a qué sitio del grupo se lleva el clic. No tiene base de datos donde
  // agregar, así que manda eventos (docs/envio-de-metricas/eventos.md).
  { slug: 'corpsc',       name: 'CORPSC',       domain: 'www.corpsc.com',        kind: ProjectKind.OWN },

  // Productos propios de CORPSC
  { slug: 'take',         name: 'Take',         domain: 'take.corpsc.com',       kind: ProjectKind.OWN },
  { slug: 'invoices',     name: 'Invoices',     domain: 'invoices.corpsc.com',   kind: ProjectKind.OWN },
  { slug: 'iris-natural', name: 'Iris Natural', domain: 'irisnatural.corpsc.com', kind: ProjectKind.OWN },
  { slug: 'humancore',    name: 'HumanCore',    domain: 'humancore.corpsc.com',  kind: ProjectKind.OWN },
  { slug: 'histolword',   name: 'HistolWord',   domain: 'histolword.corpsc.com', kind: ProjectKind.OWN },
  { slug: 'tu-chamba',    name: 'Tu Chamba',    domain: 'tu-chamba.corpsc.com',  kind: ProjectKind.OWN },
  { slug: 'dandomuela',   name: 'Dando Muela',  domain: 'dandomuela.com',        kind: ProjectKind.OWN },
  // Sitios de clientes
  { slug: 'kods-ai',    name: 'Kods AI',    domain: 'kods.ai',        kind: ProjectKind.CLIENT },
  { slug: 'popyplan',   name: 'Popyplan',   domain: 'popyplan.com',   kind: ProjectKind.CLIENT },
  { slug: 'zendinit',   name: 'Zendinit',   domain: 'zendinit.com',   kind: ProjectKind.CLIENT },
  { slug: 'orlegitech', name: 'Orlegitech', domain: 'orlegitech.com', kind: ProjectKind.CLIENT },
  { slug: 'tikneo',     name: 'Tikneo',     domain: 'tikneo.com',     kind: ProjectKind.CLIENT },
  { slug: 'calculum',   name: 'Calculum',   domain: 'www.calculum.ai', kind: ProjectKind.CLIENT },
  { slug: 'emasex',     name: 'Emasex',     domain: 'emasex.com',     kind: ProjectKind.CLIENT },
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

// Catálogo de lo que los proyectos envían.
//
// Solo medidas ADITIVAS. Las que llevan `derivedFrom` no se guardan nunca: se
// calculan al leer, porque una tasa o una media no se pueden sumar entre días
// sin falsear el número.
//
// Un proyecto puede enviar métricas que no estén aquí: se registran solas,
// desactivadas, hasta que alguien decida cómo se llaman.
const METRICS: MetricSeed[] = [
  // ── Tráfico, del propio registro de cada sitio ──
  //
  // No hay "visitantes únicos": sumar los únicos de cada día cuenta varias
  // veces a quien vuelve, y desde datos diarios no se puede saber cuántas
  // personas distintas hubo en un mes. Enseñar un número inflado sería peor
  // que no enseñarlo. `visits` sí es sumable: quien vuelve tres días hizo
  // tres visitas.
  { key: 'visits',        label: 'Visitas',          labelEn: 'Visits',      unit: MetricUnit.COUNT, sortOrder: 10 },
  { key: 'page_views',    label: 'Páginas vistas',   labelEn: 'Page views',  unit: MetricUnit.COUNT, sortOrder: 20 },
  { key: 'sessions',      label: 'Sesiones',         labelEn: 'Sessions',    unit: MetricUnit.COUNT, sortOrder: 30 },

  // ── Negocio ──
  { key: 'product_views', label: 'Productos vistos', labelEn: 'Product views', unit: MetricUnit.COUNT, sortOrder: 60 },
  { key: 'add_to_cart',   label: 'Añadidos al carrito', labelEn: 'Add to cart', unit: MetricUnit.COUNT, sortOrder: 70 },
  { key: 'ad_views',      label: 'Anuncios vistos',  labelEn: 'Ad views',    unit: MetricUnit.COUNT,    sortOrder: 80 },
  { key: 'site_clicks',   label: 'Clics a otros sitios', labelEn: 'Site clicks', unit: MetricUnit.COUNT, sortOrder: 90 },

  { key: 'orders',        label: 'Pedidos',          labelEn: 'Orders',      unit: MetricUnit.COUNT,    sortOrder: 110 },
  { key: 'orders_paid',   label: 'Pedidos cobrados', labelEn: 'Paid orders', unit: MetricUnit.COUNT,    sortOrder: 120 },
  { key: 'orders_cancelled', label: 'Pedidos cancelados', labelEn: 'Cancelled orders', unit: MetricUnit.COUNT, sortOrder: 125 },
  { key: 'revenue',       label: 'Ingresos',         labelEn: 'Revenue',     unit: MetricUnit.CURRENCY, sortOrder: 130 },
  { key: 'leads',         label: 'Contactos',        labelEn: 'Leads',       unit: MetricUnit.COUNT,    sortOrder: 140 },
  { key: 'signups',       label: 'Altas',            labelEn: 'Signups',     unit: MetricUnit.COUNT,    sortOrder: 150 },
  { key: 'publications',  label: 'Publicaciones',    labelEn: 'Publications',unit: MetricUnit.COUNT,    sortOrder: 160 },
  { key: 'invoices',      label: 'Facturas',         labelEn: 'Invoices',    unit: MetricUnit.COUNT,    sortOrder: 170 },

  // ── Derivadas: NO se persisten ──
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
      // Solo se refrescan los datos de identidad. `timezone`, `currency`,
      // `active` y `sortOrder` se dejan como estén: son ajustes editables
      // desde el panel y volver a sembrar no debe deshacerlos.
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
      // Las que están en esta lista son las que el hub conoce, así que se
      // activan aunque la ingesta las hubiera descubierto antes y registrado
      // como inactivas. A diferencia de los ajustes de un proyecto, el
      // catálogo de métricas no lo edita nadie desde el panel.
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
 * Crea el primer ADMIN solo si no hay ninguno y se han pasado las variables.
 * Nunca hay una contraseña por defecto en el código: un hub con datos de
 * clientes y un admin/admin sembrado es un incidente esperando a ocurrir.
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
