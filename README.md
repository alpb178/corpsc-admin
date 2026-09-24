# CORPSC Hub

Panel centralizado de analítica y KPIs de los **5 sitios** del grupo CORPSC
(el corporativo y los cuatro productos propios). Consolida en una sola base el tráfico y las
métricas de negocio que cada sitio envía, para poder decidir marketing con
datos del grupo y no de un sitio suelto.

```
corpsc-hub/
├── api/    NestJS 12 + Prisma 7 + PostgreSQL
└── web/    Next.js 16 + Recharts
```

## Arranque local

```bash
# 1. Base de datos
docker compose up -d

# 2. API
cd api
cp .env.example .env          # rellenar JWT_SECRET y HUB_ENCRYPTION_KEY
pnpm install
pnpm prisma migrate dev
SEED_ADMIN_EMAIL=tu@corpsc.com SEED_ADMIN_PASSWORD='<10+ caracteres>' pnpm seed
pnpm start:dev
```

API en `http://localhost:3001/api`, documentación Swagger en
`http://localhost:3001/docs`.

Las dos claves se generan así:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # HUB_ENCRYPTION_KEY — exactamente 32 bytes
```

> `HUB_ENCRYPTION_KEY` cifra las claves de envío guardadas en la tabla
> `credential`. Si se pierde, hay que volver a introducir todas las
> credenciales; si se regenera en producción, las existentes quedan ilegibles.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| **F0** | Base: esquema, auth con roles, cifrado de credenciales, catálogo de sitios y métricas | ✅ |
| **F1** | Recepción de envíos, validación de contrato, vigilancia de frescura | ✅ |
| **F2** | Endpoints de lectura, ratios derivados, comparación de periodos | ✅ |
| **F3** | Panel en Next.js: resumen, ficha de sitio, comparador y envíos | ✅ |
| **F4** | Contrato de envío y KPIs de negocio | ✅ hub · pendiente en los 4 repos |
| F5 | Alertas, objetivos y exportación | pendiente |

## Modelo de datos, en una frase

La tabla de hechos `metric_daily` es **estrecha**: una fila por (proyecto,
fuente, día, métrica, dimensión, valor de dimensión). Y solo guarda medidas
**aditivas** — nunca CTR, tasas ni posiciones medias, que se calculan al leer,
porque promediar promedios entre días da números falsos.

El detalle del diseño, con las decisiones y los riesgos, está en [`CLAUDE.md`](./CLAUDE.md).

## Leer los datos

```
GET /api/metrics/overview?from=&to=&compare=true     KPIs del grupo y tabla por sitio
GET /api/metrics/projects/:slug?from=&to=            ficha completa de un sitio
GET /api/metrics/compare?slugs=a,b&metric=sessions   una métrica, varios sitios
GET /api/metrics/definitions                         catálogo de métricas
GET /api/metrics/freshness                           quién ha enviado y cuándo
GET /api/metrics/runs                                últimos envíos recibidos
GET /api/metrics/visitors?from=&to=&project=         visitantes únicos, nuevos y recurrentes
GET /api/metrics/realtime?project=&minutes=5         activos ahora y últimos eventos
GET /api/projects/:slug/goals                        objetivos de conversión del sitio
PUT /api/projects/:slug/goals/:eventName             marcar un evento como conversión (admin)
DELETE /api/projects/:slug/goals/:eventName          dejar de contarlo (admin)
```

Los **visitantes únicos** no se suman día a día —quien vuelve tres días
contaría tres veces—: se cuentan al leer sobre `visitor_daily`. En el grupo, un
visitante es un par (sitio, visitante): cada sitio emite su propia cookie, así
que la misma persona en dos sitios cuenta dos veces. `since` dice desde qué día
hay visitantes identificados (beacons v2).

El **tiempo real** es la única vista que no pasa por `metric_daily`: lee los
últimos minutos de `site_event` directamente, y el panel lo consulta cada pocos
segundos.

`compare=true` añade la comparación con el periodo anterior de la misma
duración, con un campo `improved` por métrica.

> La cadena entera —un clic en un front, el evento, la consolidación y el
> número en el panel— se puede montar en local sin desplegar nada:
> [`docs/PRUEBAS-EN-LOCAL.md`](./docs/PRUEBAS-EN-LOCAL.md).

### Para desarrollar sin credenciales

```bash
pnpm seed:demo   # métricas sintéticas de 4 sitios, 2 meses
```

Son cifras inventadas con forma plausible, no datos de ningún sitio real.

## Cómo entran los datos

**Los proyectos empujan; el hub recibe.** Cada sitio del grupo calcula sus
agregados diarios —tráfico de su propio registro y métricas de negocio— y los
envía a `POST /api/ingest/metrics` con su clave. El hub no sale a buscar nada:
no habla con Google ni con ningún servicio externo.

**Salvo los sitios que no tienen dónde agregar.** El portfolio del grupo y los
sitios de cliente son páginas en Vercel sin base de datos: mandan el hecho
suelto —una visita, un clic hacia otro sitio del grupo— a
`POST /api/ingest/events`, y el hub los consolida en unos segundos en las mismas
métricas diarias que envía todo el mundo: `visits`, `page_views` y
`site_clicks` desglosado por proyecto de destino. Lo crudo se guarda 90 días
para poder recalcular un día, y no incluye ni IP ni agente de usuario.

El contrato, las reglas y las implementaciones de referencia están en
[`docs/envio-de-metricas/`](./docs/envio-de-metricas/).

El hub **valida el envío** y devuelve 400 si no encaja, en lugar de guardar
datos mal formados. Una métrica que no conozca se registra desactivada: se
guarda igual, pero no se muestra hasta revisarla.

> La contrapartida de recibir en vez de ir a buscar: si el cron de un proyecto
> se rompe, no falla nada visible — simplemente dejan de llegar datos. Por eso
> la pestaña **Envíos** vigila el silencio, y un cron diario avisa de quién
> lleva más de 72 h sin enviar.

Falta implementarlo en `tu-chamba`, `Iris Natural`, `toma` e `invoice-gen`.

## Panel

```bash
cd web
cp .env.example .env          # API_URL apuntando a la API
pnpm install
pnpm dev                      # http://localhost:3000
```

Cuatro vistas: **Resumen** del grupo (`/`), **ficha de cada sitio**
(`/projects/[slug]`), **comparador** (`/compare?sites=a,b`) y **envíos**
(`/submissions`). Todas aceptan `?range=7d|28d|90d|12m`, y el rango vive en la
URL para poder compartir una vista concreta. Las rutas y los parámetros
antiguos en español (`/comparar`, `/envios`, `/proyectos/…`, `/ajustes/…`,
`?rango=`, `?sitios=`) siguen funcionando: redirigen o se aceptan como alias.

Y **Ajustes** (`/settings`), solo para administradores: en `Proyectos` se editan zona
horaria, moneda, orden y visibilidad de cada sitio, y se genera, asigna o
revoca su clave de envío —la clave en claro se enseña una sola vez, al
crearla—; en `Usuarios`, el alta de quien entra al panel.

El rango siempre termina **ayer**: los proyectos envían de madrugada el día
cerrado, así que incluir hoy solo añadiría una caída al final de cada gráfica
que no significa nada.


## Flujo de trabajo

El de siempre: ramas `feature/*` → PR a `develop` → PR a `main`.
Ver [`FLUJO-TRABAJO-DEVS.md`](./FLUJO-TRABAJO-DEVS.md).
