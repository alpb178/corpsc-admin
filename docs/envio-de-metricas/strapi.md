# Referencia Strapi 5

Para `toma` e `invoice-gen`. Aquí no hay nada que reempaquetar: hoy la
agregación se hace en el cliente, así que la consulta se escribe desde cero.

Se usa Knex directamente (`strapi.db.connection`) en lugar del Document
Service: son agregados por día, y traerse todos los pedidos para contarlos en
JavaScript no escala ni hace falta.

## 1. El servicio que envía

Ejemplo para **toma**, que factura en dos monedas y tiene `activity_logs`.

```js
// src/api/hub/services/hub.js
const TZ = 'America/La_Paz';
// Se reenvían los últimos días: un pedido que se cobra o se cancela cambia el
// agregado de días anteriores, y el hub reemplaza la ventana entera.
const REENVIAR_DIAS = 3;

// Nombres de tabla literales de este archivo, nunca de una petición: Postgres
// no admite parámetros para identificadores.
const ORDERS = 'orders';
const LOGS = 'activity_logs';
const MESSAGES = 'contact_messages';

function localDay(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

module.exports = () => ({
  async push() {
    const url = process.env.HUB_URL;
    const key = process.env.HUB_API_KEY;
    // Sin configurar, no-op: un entorno de desarrollo no manda nada al hub.
    if (!url || !key) return;

    const to = localDay(-1);
    const from = localDay(-REENVIAR_DIAS);

    try {
      const payload = await this.build(from, to);

      const response = await fetch(`${url}/api/ingest/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }

      const result = await response.json();
      strapi.log.info(`Hub: enviado ${from}…${to}, ${result.rowsWritten} filas`);
      (result.warnings || []).forEach((w) => strapi.log.warn(`Hub: ${w}`));
    } catch (e) {
      // No se relanza: que el hub esté caído no puede romper el cron de Strapi.
      strapi.log.error(`Hub: fallo al enviar — ${e.message}`);
    }
  },

  async build(from, to) {
    const knex = strapi.db.connection;
    const day = `(created_at AT TIME ZONE 'UTC' AT TIME ZONE ?)::date`;

    const [orders, traffic, leads] = await Promise.all([
      knex.raw(
        `SELECT to_char(${day}, 'YYYY-MM-DD') AS d,
                count(*)::int                       AS orders,
                count(*) FILTER (WHERE is_pay)::int AS orders_paid,
                coalesce(sum(price_usd), 0)::float  AS usd,
                coalesce(sum(price_cup), 0)::float  AS cup
           FROM ${ORDERS}
          WHERE ${day} BETWEEN ?::date AND ?::date
          GROUP BY 1`, [TZ, TZ, from, to]),
      knex.raw(
        `SELECT to_char(${day}, 'YYYY-MM-DD') AS d,
                count(*) FILTER (WHERE event = 'page_view')::int AS page_views,
                count(DISTINCT session_id)::int                  AS visits
           FROM ${LOGS}
          WHERE ${day} BETWEEN ?::date AND ?::date
          GROUP BY 1`, [TZ, TZ, from, to]),
      knex.raw(
        `SELECT to_char(${day}, 'YYYY-MM-DD') AS d, count(*)::int AS value
           FROM ${MESSAGES}
          WHERE ${day} BETWEEN ?::date AND ?::date
          GROUP BY 1`, [TZ, TZ, from, to]),
    ]);

    const byDay = new Map();
    const get = (d) => {
      if (!byDay.has(d)) byDay.set(d, { date: d, metrics: {}, breakdowns: [] });
      return byDay.get(d);
    };

    for (const r of traffic.rows) {
      const day = get(r.d);
      day.metrics.visits = r.visits;
      day.metrics.page_views = r.page_views;
    }
    for (const r of orders.rows) {
      const day = get(r.d);
      day.metrics.orders = r.orders;
      day.metrics.orders_paid = r.orders_paid;
      // Dos monedas reales, como desglose. NUNCA un total mezclado: el hub se
      // niega a sumar monedas distintas, y con razón.
      day.breakdowns.push({
        metric: 'revenue', dimension: 'currency', values: { USD: r.usd, CUP: r.cup },
      });
    }
    for (const r of leads.rows) get(r.d).metrics.leads = r.value;

    return {
      schemaVersion: 1,
      project: 'take',
      timezone: TZ,
      generatedAt: new Date().toISOString(),
      range: { from, to },
      definitions: [
        { key: 'visits',      label: 'Visitas',          unit: 'count' },
        { key: 'page_views',  label: 'Páginas vistas',   unit: 'count' },
        { key: 'orders',      label: 'Pedidos',          unit: 'count' },
        { key: 'orders_paid', label: 'Pedidos cobrados', unit: 'count' },
        { key: 'leads',       label: 'Contactos',        unit: 'count' },
        // Sin `currency` declarada porque aquí conviven dos monedas: cada
        // importe lleva la suya en el desglose `currency`, y no se manda total
        // —mezclar dólares con pesos da un número sin significado.
        { key: 'revenue',     label: 'Ingresos',         unit: 'currency' },
      ],
      days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
  },
});
```

## 2. El cron

```js
// config/cron-tasks.js
module.exports = {
  hubPush: {
    task: async ({ strapi }) => {
      await strapi.service('api::hub.hub').push();
    },
    options: { rule: '0 30 4 * * *', tz: 'America/La_Paz' },
  },
};
```

Y en `config/server.js`:

```js
cron: { enabled: true, tasks: require('./cron-tasks') },
```

## 3. Variables de entorno

```bash
# .env y .env.example
HUB_URL=https://hub.corpsc.com
HUB_API_KEY=
```

## 4. Comprobarlo

```bash
# Desde `strapi console`
await strapi.service('api::hub.hub').push()
```

Contrastar un día a mano contra el backoffice antes de dar el envío por bueno:
si el recorte horario está mal, los números bailan un día.

## Para invoice-gen

Igual, pero sin tráfico: no tiene registro propio. Solo negocio, agrupando
`invoices` por `status` (`draft`/`sent`/`paid`/`cancelled`) y sumando
`total_amount` por día.
