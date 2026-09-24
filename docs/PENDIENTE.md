# Pendiente para cerrar el plan de analítica

Estado al 2026-09-24. Lo hecho está en `develop` del hub (PRs #17–#31) y de los
cinco sitios. Esto es lo que falta, en el orden en que conviene hacerlo.

## 1. ~~Desbloquear la PR #32~~ — hecho

[#32](https://github.com/alpb178/corpsc-admin/pull/32) se mergeó el
2026-09-24 con los tres jobs del CI en verde. `develop` está en verde.

## 2. ~~Fase 0 — endurecer la API y el panel~~ — hecho

Mergeada en [#34](https://github.com/alpb178/corpsc-admin/pull/34). Queda comprobar en
Render que el servicio tenga `NODE_ENV=production` (o nada): el Blueprint solo
lo aplica al sincronizar.

- [x] Swagger (`/docs`) solo fuera de producción
      (`api/src/main.ts`).
- [x] `/health/db` responde `{ database: 'down' }` sin el mensaje de Postgres
      (`api/src/health/health.service.ts`).
- [x] CORS: aceptar `http://localhost:*` solo fuera de producción
      (`api/src/main.ts`; sacar la lógica a una función con test).
- [x] Login del panel: un 429 debe decir "Demasiados intentos, espera unos
      minutos" y no "Credenciales incorrectas" (`web/src/app/login/actions.ts`).
- [x] Tests de cada punto.

## 3. Fase 6 — cerrar tests y CI

- [ ] Subir el suelo de coverage de la API a 95 en `api/vitest.config.mts`
      (hoy está en 79 y la cobertura real es 99,75 % líneas / 95,1 % branches).
- [ ] Tests del panel: de 65 % a ≥ 95 %. Sin cubrir: `lib/api.ts`,
      `lib/dal.ts`, `lib/session.ts`, `TrendChart`, `SiteNavigation`,
      `HourlyActivity`, `ProjectPicker`, `RangePicker`, `BusinessKpis`,
      `FreshnessBadge`, `ErrorPanel`, `PageHeader`, acciones de Ajustes. Subir
      el suelo de `web/vitest.config.mts` con cada PR.
- [ ] E2E con Playwright (dependencia nueva): login → Dashboard → ficha de un
      proyecto → cambiar rango → Configuración (solo admin). Con `seed:demo` y
      un job en `.github/workflows/ci.yml`.

## 4. Fase 4.4 — filtros (P2)

- [ ] Filtros por país, fuente y dispositivo en el Dashboard y la ficha.
      `metric_daily` guarda una dimensión por fila, así que los filtros cruzados
      (páginas vistas *solo* desde Instagram) hay que leerlos de `site_event`,
      que vale para rangos de hasta 90 días.
- [ ] Rango personalizado (desde / hasta) además de los presets.

## 5. Pasar a producción (orden obligatorio)

1. [ ] **Hub primero**: `develop` → `main` de corpsc-admin. Un sitio con el
       tracker v2 apuntando a un hub que solo entiende v1 pierde todos sus
       eventos (se rechazan con 400).
2. [ ] `corpsc-web` a producción. Revisar su ficha en el panel un día.
       **Las visitas bajarán**: se corrige el inflado de sesiones, no es una
       caída real.
3. [ ] Tu Chamba, Iris Natural, Take e Invoices.
4. [ ] Revisión visual del panel con `pnpm dev` en escritorio y móvil
       (Drawer, Dashboard, ficha, En vivo): no se ha podido renderizar al
       desarrollarlo.

## 6. Decisiones que faltan

- [ ] **Conversiones por sitio (D4)**: qué eventos cuentan. Hace falta en cada
      sitio la llamada `track('nombre')` y, en el hub,
      `PUT /api/projects/:slug/goals/:nombre`. Propuesta de partida:
      `contact_submit` (corpsc), `listing_publish` y `contact_employer` (Tu
      Chamba), `add_to_cart` y `whatsapp_order` (Iris, Take), `signup`
      (Invoices).
- [ ] **Hosting (D5)**: confirmar si `corpsc-web`, `tu-chamba/web` e
      `invoice-gen/frontend` están en Vercel. Si no, región y ciudad no llegan.
- [ ] **Consentimiento**: revisar el requisito legal de la cookie `hub_vid`
      (visitante, 1 año) según el mercado de cada sitio.

## 7. Deuda encontrada, fuera del plan

- [ ] Take: 3 tests de `Cart` y `checkout-utils` fallan ya en `develop`.
- [ ] Invoices: `yarn.lock` desactualizado; `yarn install --frozen-lockfile`
      falla en `develop`.
- [ ] README y comparador con datos viejos: "14 sitios", máximo de 14.
- [ ] API y Postgres en el plan free de Render (se duermen, límites de
      almacenamiento): revisar antes de que suba el volumen.

## Fase 7 — solo si hace falta

Particionar `site_event` por mes, consolidación incremental y plan de pago de
Postgres, cuando se pase de ~100k eventos/día o `ingestion_run.duration_ms`
supere 5 s en el p95.
