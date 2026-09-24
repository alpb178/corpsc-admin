# Probar la cadena completa en local

De un clic en un front al número en el panel, sin desplegar nada. Media hora la
primera vez; después, dos terminales.

La cadena que se va a montar:

```
front (:3005) ──▶ /api/hub-track ──▶ hub API (:3001) ──▶ Postgres
                                                            │
                                              pnpm rollup ──┘──▶ panel (:3000)
```

## 1. Base de datos

```bash
docker compose up -d          # Postgres en el 5433
```

Con un Postgres ya instalado en el sistema vale igual: `createdb corpsc_hub` y
apuntar `DATABASE_URL` al 5432.

## 2. API del hub

```bash
cd api
cp .env.example .env
```

Rellenar las dos claves del `.env`:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # HUB_ENCRYPTION_KEY — exactamente 32 bytes
```

```bash
pnpm install
pnpm prisma migrate dev
SEED_ADMIN_EMAIL=tu@corpsc.com SEED_ADMIN_PASSWORD='una-contraseña-larga' pnpm seed
pnpm start:dev                # API en :3001, Swagger en /docs (con NODE_ENV=development)
```

## 3. Panel

```bash
cd ../web
cp .env.example .env          # API_URL=http://localhost:3001/api
pnpm install
pnpm dev                      # :3000
```

Entrar con el correo y la contraseña de la semilla.

> **Atajo si solo quieres ver el panel con datos**: `pnpm seed:demo` en `api/`
> inventa dos meses de métricas de cuatro sitios y te saltas los pasos 4 a 7.
> Son cifras plausibles, no datos de ningún sitio real.

## 4. Emitir la clave del proyecto

En el panel: **Ajustes → Proyectos**, desplegar el sitio que vayas a probar y
**Generar clave**. Se enseña una sola vez; cópiala.

De paso, comprueba su zona horaria: el día se recorta con ella y si no coincide
con la del sitio las series salen desplazadas.

## 5. Levantar un front con esa clave

Cualquiera de los cinco. Por ejemplo el portfolio:

```bash
cd ../../corpsc-portfolio
printf 'HUB_URL=http://localhost:3001/api\nHUB_API_KEY=<la clave>\n' > .env
pnpm dev --port 3005
```

`.env` está en `.gitignore` de los cinco repos, pero conviene borrarlo al
terminar: es una clave.

## 6. Generar tráfico

Navegando por `http://localhost:3005` y pinchando un enlace del cintillo del
grupo ya cuenta. Para no depender del navegador:

```bash
# una visita (guarda la cookie de sesión en jar.txt)
curl -s -o /dev/null -c jar.txt -X POST localhost:3005/api/hub-track \
  -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0' \
  -d '{"events":[{"type":"page_view","path":"/es"}]}'

# una segunda página de la MISMA visita
curl -s -o /dev/null -b jar.txt -X POST localhost:3005/api/hub-track \
  -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0' \
  -d '{"events":[{"type":"page_view","path":"/en"}]}'

# un clic que se va a otro sitio del grupo
curl -s -o /dev/null -b jar.txt -X POST localhost:3005/api/hub-track \
  -H 'Content-Type: application/json' -H 'User-Agent: Mozilla/5.0' \
  -d '{"events":[{"type":"site_click","path":"/es","target":"take","linkType":"web"}]}'
```

Comprobar que han llegado —la ruta siempre responde `204`, así que el `204` no
prueba nada—:

```sql
select type, left(session_id, 8), path, target from site_event order by id;
```

Dos cosas que conviene probar porque deben **no** contarse: con
`-H 'User-Agent: Googlebot/2.1'` no se guarda nada, y sin la cookie sale otra
sesión distinta, es decir, otra visita.

## 7. Consolidar sin esperar a las 03:00

```bash
cd ../corpsc-hub/api
pnpm rollup corpsc                        # un sitio, últimos 4 días
pnpm rollup                               # todos los proyectos activos
pnpm rollup corpsc 2026-09-01 2026-09-21  # una ventana concreta
```

Escribe lo que ha hecho por sitio, y dice `sin eventos en la ventana` cuando no
había nada, que no es lo mismo que un cero. Volver a lanzarlo sobre la misma
ventana la reescribe entera: es idempotente.

## 8. Mirar el resultado

En el panel: **Resumen** y la ficha del sitio. El rango termina **ayer**, así
que para ver lo que acabas de generar hoy hay que mirar la base o esperar a
mañana:

```sql
select m.metric_key, m.dimension, m.dim_value, m.value
  from metric_daily m join project p on p.id = m.project_id
 where p.slug = 'corpsc' order by 1, 3;
```

Con los tres beacons de arriba salen `visits 1`, `page_views 2` repartidas por
ruta y `site_clicks 1` hacia `take`.

## Cuando algo no aparece

| Síntoma | Dónde mirar |
|---|---|
| No hay filas en `site_event` | ¿Están `HUB_URL` y `HUB_API_KEY` en el front? Sin ellas la ruta responde `204` y no envía |
| La API responde `401` | La clave no es la de ese proyecto, o el proyecto está inactivo o sin credencial asignada |
| Hay eventos pero no métricas | Falta consolidar: `pnpm rollup` |
| Las cifras salen un día corridas | La zona horaria del proyecto en Ajustes no es la del sitio |
| El sitio figura como "nunca ha enviado" | La frescura solo se marca al consolidar, y solo si había eventos |
