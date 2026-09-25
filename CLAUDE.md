# CLAUDE.md — corpsc-hub

Hub de analítica centralizada de CORPSC. `api/` (NestJS + Prisma + Postgres) y
`web/` (Next.js). Todo lo que ve el usuario va **en español**.

**Los proyectos empujan; el hub recibe.** Cada sitio del grupo calcula sus
agregados diarios y los envía a `POST /api/ingest/metrics`. El hub no sale a
buscar nada y no habla con ningún servicio externo.

## Flujo de trabajo (obligatorio)

Documento canónico: [`FLUJO-TRABAJO-DEVS.md`](./FLUJO-TRABAJO-DEVS.md).

- `main` (producción) y `develop` (staging) están protegidas. **Nunca** push
  directo a ninguna de las dos.
- Toda rama sale de `develop`: `feature/*`, `fix/*`, `chore/*`, con nombre
  descriptivo en kebab-case.
- Commits: `feat:` · `fix:` · `chore:` · `refactor:` · `test:` · `docs:`.
  Atómicos y compilables.
- PRs siempre a `develop`, uno por cosa, con `gh pr create --base develop --assignee @me`.
  Merge con **Squash and merge**.
- **Todo en inglés salvo lo que ve el usuario:** nombres de rama, mensajes de
  commit, títulos y descripciones de PR, y el código (modelos, campos, enums,
  clases, rutas nuevas, claves JSON, variables). Los textos de la UI siguen en
  español. El código legado en español no se renombra "de paso". Detalle en
  `FLUJO-TRABAJO-DEVS.md`, secciones "Idioma del código" e "Idioma de git".

## Tests y CI (obligatorio)

- **Toda feature, cambio funcional o cambio en el tracking incluye o actualiza
  sus tests en el mismo PR.** Sin excepción: el tracker corre en cinco sitios y
  un error de forma se convierte en datos silenciosamente equivocados.
- **El CI (`.github/workflows/ci.yml`) corre en cada PR** a `develop` y `main`:
  API contra un Postgres real (typecheck, lint sin `--fix`, tests con coverage,
  build), panel (typecheck, lint, tests con coverage, build) y tracker.
- **Los umbrales de coverage son un suelo que solo sube.** Están en el
  `vitest.config` de cada paquete; un PR que añade tests los sube a lo que
  alcanza. El objetivo es ≥ 95 % en los tres; la API y el tracker ya lo
  exigen, el panel todavía no.

## Decisiones de diseño que no hay que deshacer sin querer

**La tabla de hechos es estrecha, no ancha.** `metric_daily` guarda una fila
por (proyecto, día, métrica, dimensión, valor). Convertirla en ancha
parece más simple hasta que llega la F4: las métricas de negocio son
heterogéneas entre proyectos (pedidos en Take e Iris, leads y publicaciones en
Tu Chamba, facturas en Invoices) y cada métrica nueva sería un `ALTER TABLE`.

**Solo se persisten medidas aditivas.** Nunca guardar tasas ni medias en la
base: sumarlas o promediarlas entre días da números falsos. La tasa de
conversión se calcula al leer como `sum(orders) / sum(visits)`. Las métricas
derivadas están en `metric_definition` con `derived_from` y se reconocen porque
**no** aparecen en `metric_daily`.

**Todo se mide en la zona horaria del proyecto**, nunca en UTC. El envío
declara la suya y el hub avisa si no coincide con la del proyecto: un desajuste
desplaza las series un día y nadie lo nota hasta que alguien compara dos sitios.

**`CryptoService` es el único punto donde se descifra un secreto.** Ningún DTO
de salida puede exponer `credential.ciphertext`.

## Trampas conocidas (documentadas, no descubrir dos veces)

- **Un envío vacío sobre un periodo con datos se RECHAZA**, no lo borra. Una
  consulta rota en un proyecto devuelve cero filas, y el reemplazo de ventana
  se llevaría por delante datos buenos sin que nadie lo note hasta semanas
  después. Está en `FactWriterService` y cubierto por tests contra Postgres.
- **`range` manda: el hub reemplaza ese periodo entero.** Lo que no venga
  dentro, se borra. Por eso un día fuera de la ventana declarada se descarta:
  quedaría escrito para siempre sin que nadie lo volviera a tocar.
- **La clave identifica al proyecto; el campo `project` del cuerpo es
  informativo.** Un proyecto no puede escribir datos de otro aunque lo intente.
- **El silencio es una señal, no una ausencia.** Si el cron de un proyecto se
  rompe, no falla nada visible: dejan de llegar datos y la gráfica se queda
  plana. `FreshnessService` lo vigila y la pestaña Envíos lo enseña. Es la
  contrapartida de recibir en vez de ir a buscar.
- **Nunca sumar `revenue` entre proyectos sin mirar `currency`.** Take factura
  en USD y CUP, Iris en BOB, Invoices en EUR/USD.

## Los sitios sin backend

- **Hay dos puertas, y un proyecto usa una sola.** Quien puede agregar, empuja
  su resumen diario a `/ingest/metrics`. Quien no —el portfolio y los sitios de
  cliente, páginas en Vercel sin base de datos— manda el hecho suelto a
  `/ingest/events`. Un proyecto que use las dos para la misma métrica se borra
  sus propios datos: el envío reemplaza la ventana entera.
- **El evento se guarda crudo y el día se decide al consolidar**, en la zona
  horaria del proyecto. Guardarlo ya recortado impediría rehacerlo cuando la
  zona estaba mal puesta, y un contador incrementado sobre la marcha no se
  puede deshacer. Se conserva 90 días: lo justo para recalcular, no como
  archivo.
- **La consolidación es dueña de `visits`, `page_views`, `site_clicks`,
  `clicks`, `custom_events`, `conversions` y `new_visitors`** y de nada más. Por eso `FactWriterService` acepta `ownedMetricKeys`: sin acotar el
  borrado de huérfanos, rehacer las visitas se llevaría por delante los pedidos
  del mismo día.
- **La consolidación es en vivo, no solo de noche.** Cada envío a
  `/ingest/events` la pide para su proyecto (`scheduleLive`): espera 10 s para
  agrupar la ráfaga, nunca corre dos veces a la vez para el mismo proyecto y
  reutiliza un `IngestionRun` por ventana, para no enterrar Envíos con uno por
  visita. En vivo rehace hoy y ayer; el cron de las 03:00, cuatro días, y
  recoge el evento que llega con más de un día de retraso. Vive en memoria:
  con más de una instancia de la API habría que moverla a una cola.
- **Sin eventos no se escribe nada.** Un sitio callado no es un sitio con cero
  visitas, y escribir ceros haría indistinguible "no entró nadie" de "los
  beacons están rotos".
- **De dónde viene una visita se decide con su primer evento del día.** País,
  canal, fuente, campaña y hora salen de ahí (`visitStarts`), para que cada
  desglose de `visits` sume el total. El país lo resuelve el hosting del sitio;
  del origen solo llega el dominio, nunca la URL entera.
- **`visitor_daily` sobrevive a los eventos crudos** (800 días frente a 90):
  es lo único que sabe si un visitante es nuevo y cuántos distintos hubo en un
  año. Por eso la consolidación solo reescribe los días que todavía tienen
  eventos; un día ya podado conserva sus visitantes. Los únicos de un rango se
  cuentan al leer, nunca se guardan: no son sumables.
- **Un beacon repetido se guarda una vez.** En la v2 cada evento lleva un
  `eventId` (UUID del navegador) y `site_event` tiene un índice único
  `(project_id, event_id)`; `createMany({ skipDuplicates })` descarta la copia.
  Los eventos v1 no lo traen y tienen NULL, que nunca choca en un índice único.
- **La ingesta se limita por clave, no por IP**, y el login por cuenta, no por
  IP (`src/common/throttle.ts`). Los sitios comparten IPs de su hosting, y el
  panel inicia sesión siempre desde su propio servidor: limitar por IP
  castigaría a todos a la vez. El contador vive en memoria, como la
  consolidación en vivo.
- **La clave nunca baja al navegador.** El sitio manda los beacons a una ruta
  suya y esa ruta llama al hub. Publicar la clave en el cliente sería dejar que
  cualquiera escriba métricas de ese proyecto.

## El tracker (`tracker/`)

- **Una fuente, cinco copias que no pueden divergir.** El código que corre en
  los sitios se escribe y se prueba aquí (≥ 95 % de coverage, lo exige
  `vitest.config.ts`) y se lleva a cada repo con `pnpm sync`. Cada copia lleva
  `MANIFEST.json` e `integrity.test.ts`: editarla a mano rompe el test del sitio.
  Antes eran cinco copias a mano y ya habían divergido.
- **La ruta del sitio responde antes de llamar al hub** (`after()` de Next ≥
  15.1). Esperar al hub —que en Render se duerme— retrasaba la cookie de visita
  y cada evento de esa espera abría una sesión nueva: visitas infladas. En Next
  14 no hay `after()` y la espera se acota a 1,5 s.
- **Las opciones de `<HubAnalytics>` son datos, no funciones**: el componente se
  monta desde un layout de servidor, y una función no cruza esa frontera.

## El contrato de envío

- **Se valida al recibirlo**, no se confía. Lo implementan cuatro equipos en
  cuatro repos: sin validar, un error de forma se convertiría en datos
  silenciosamente equivocados. Contrato y referencias en
  `docs/envio-de-metricas/`.
- **El ejemplo de la documentación tiene un test** (`contract-fixture.spec.ts`).
  Si documentación y código se separan, cada equipo implementará lo que dice el
  ejemplo y el hub se lo rechazará.
- **Una métrica desconocida se registra inactiva**, no se descarta: el dato no
  se pierde, pero no se muestra hasta que alguien decida cómo se llama.
- **Los desgloses se recortan al top-100 por día en el hub**, no se confía en
  que el proyecto lo haga: un desglose por ruta puede traer miles de valores.
  El resto se suma en `__other__`, para que siga cuadrando con el total.
- **El panel solo pinta las métricas que el proyecto envía.** Una tienda no
  publica ofertas y un portal de empleo no factura: enseñar "Facturas 0" sería
  inventarse una métrica que allí no significa nada.

## El panel (`web/`)

- **Las rutas del panel están en inglés** (`/compare`, `/submissions`,
  `/projects/[slug]`, `/settings/projects`, `/settings/users`) y los
  parámetros también (`?range=`, `?sites=`). Las antiguas en español
  (`/comparar`, `/envios`, `/proyectos/…`, `/ajustes/…`) redirigen con un 308
  desde `redirects()` en `next.config.ts`, que corre antes que `proxy.ts`; y
  `?rango=` / `?sitios=` se siguen leyendo como alias. No quitar ni lo uno ni lo
  otro: hay enlaces compartidos y marcadores con las rutas viejas.

- **La navegación es un drawer, como el admin de Tu Chamba** (`components/AppDrawer.tsx`):
  Dashboard, un elemento por proyecto —sale de `GET /projects`, así que un
  proyecto nuevo aparece solo— y las herramientas. Riel de 64 px que se abre
  al pasar el ratón; en táctil, ☰ lo fija; en el móvil el riel se oculta y ☰
  es la entrada. Cada menú recuerda la página en la que se abrió, y navegar lo
  cierra sin un efecto que haga `setState` (lo prohíbe el lint del React
  Compiler). Los enlaces conservan `?range=`.
- **Los tests del panel corren con Vitest y Testing Library** (`pnpm test`).
  `server-only` se sustituye por un módulo vacío en `vitest.config.mts`.
- **La seguridad vive en `lib/dal.ts`, no en `proxy.ts`.** La documentación de
  Next 16 es explícita: el proxy es capa de experiencia. Las Server Functions
  se ejecutan como POST contra su propia ruta, así que un cambio de `matcher`
  puede dejarlas sin cobertura. Toda página y toda acción llaman a
  `requireUser()`; el proxy solo mira si la cookie existe, para enseñar el
  login en lugar de una pantalla vacía.
- **La paleta de gráficos está validada, no elegida a ojo.** Banda de
  luminosidad, suelo de croma, separación para daltonismo (ΔE ≥ 8 en pares
  adyacentes) y contraste contra la superficie blanca. **El orden de los slots es el
  mecanismo de seguridad, no una decisión estética: no reordenar sin volver a
  validar.**
- **El color sigue al sitio, nunca a su posición en el ranking**
  (`lib/series-slots.ts`). Si se asignara por índice del array, quitar un sitio
  del comparador repintaría a todos los demás.
- **Máximo ocho series.** La novena no es una tinta nueva: se agrupa o se
  divide el gráfico.
- **Los KPI son tarjetas, no gráficos**, al estilo del admin de Tu Chamba: la
  cifra grande en el azul de marca, la variación como píldora (flecha + %
  + "vs anterior") y un *sparkline* de sus propios días sin ejes ni leyenda
  (`StatTile`, `DeltaPill`, `Sparkline`). Lo que se pide al dashboard es que
  el crecimiento o la caída esté siempre a la vista; para leer valores está el
  gráfico de abajo.
- **Cada sitio tiene su tarjeta y su propia comparación** (`ProjectCards`).
  La API compara cada proyecto con *su* periodo anterior (`projects[].comparison`
  en `/metrics/overview?compare=true`): el grupo puede subir mientras un sitio
  cae, y esa caída tiene que verse en su tarjeta, no diluirse en la flecha
  verde del total. Los sitios sin visitas se nombran al pie, sin tarjeta: un
  cero con línea plana parece un sitio en apuros.
- **Las columnas por día van en HTML** (`DailyColumns`), como en Tu Chamba: una
  tinta, el pico escrito, el resto en el tooltip, y los días vacíos como muesca
  gris. Más de 31 días se suman por columna (`bucketed`): sólo para métricas
  aditivas, nunca para tasas.
- **Las cifras hacen *count-up* escribiendo en el nodo de texto, sin
  `setState`** (`AnimatedNumber`): el servidor pinta la cifra final (no hay
  destello a 0) y el tween escribe `nodeValue` sobre el nodo que React creó,
  para que la siguiente actualización de React siga cayendo en él. Toda
  animación lleva `motion-reduce:animate-none` y el count-up respeta
  `prefers-reduced-motion`: las cifras y las barras son el contenido.
- **El dashboard abre con el proyecto líder** (`LeadingProject`): el sitio con
  más visitas del periodo, su variación, su cuota del grupo y sus días. Su
  tarjeta sigue en la cuadrícula de abajo, entre las demás, para comparar.
- **Los países van en un mapa con la lista al lado** (`CountriesCard`,
  `WorldMap`). El mapa es `react-svg-worldmap` (MIT): lleva sus propios datos
  y no pide nada fuera. Se carga **sólo en el cliente** (`next/dynamic` con
  `ssr: false`): mide la ventana para el ancho responsive y su HTML de
  servidor nunca coincide con el del navegador; React marcaba la hidratación.
  La paleta secuencial va como literales hex porque la librería escribe el
  color en atributos SVG, donde una variable CSS no resuelve. El mapa es la
  imagen; las cifras están en la lista con banderas, no dependen de matices.
- **Los dispositivos son una barra partida y una ficha por dispositivo con
  icono** (`DeviceSplit`), y el horario lleva las cuatro franjas del día con su
  cuota (`HourlyActivity`): lo que se pide a esas tarjetas es una respuesta de
  una palabra ("móvil", "por la tarde"), no una lista que leer.
- **El dashboard se refresca solo cada minuto** (`AutoRefresh`,
  `router.refresh()` en una transición): las cifras ruedan al valor nuevo y
  las animaciones CSS de entrada no se repiten porque el DOM se conserva. Para
  mientras la pestaña está oculta y se pone al día al volver, como En vivo.
- **Las barras de ranking van en HTML, no en Recharts** (`RankBar`). Los
  nombres largos —una consulta, una URL— se truncan mucho mejor con CSS.
  Recharts se usa solo donde aporta: series temporales con crosshair. El
  relleno va *detrás* de la fila (nombre, cifra y % del total en una línea),
  el % es sobre toda la lista incluido `__other__`, y sólo hay total y % con
  unidad `COUNT`: una lista de tasas no suma. `kind` pone una marca al lado
  (`RankIcon`): bandera por código ISO, icono por dispositivo o canal, y una
  ficha con la inicial para las fuentes, porque un favicon obligaría a pedirlo
  fuera y el panel no habla con nadie.
- **Las líneas son rectas (`type="linear"`), no suavizadas.** Suavizar inventa
  valores intermedios que ningún día tuvo.
- **Solo modo claro, sobre blanco**, como los admins de tu-chamba e Iris
  Natural. El modo oscuro se retiró el 2026-09-22; si vuelve, necesita sus
  propios pasos de paleta validados, no un volteo de la clara.
- **El color nunca va solo**: las variaciones llevan flecha y texto, y el
  estado de las fuentes lleva icono y palabra.
- **Ajustes comprueba el rol en cada página y en cada acción**, no solo en su
  layout ni en el menú. Una Server Function se ejecuta como POST contra su
  propia ruta: si la comprobación viviera solo en el layout, la acción quedaría
  abierta a cualquiera con sesión. Esconder el enlace del menú es cortesía, no
  seguridad.
- **La clave de envío se enseña una sola vez**, al crearla, y el panel no la
  guarda en ningún sitio: viaja en el estado del formulario y desaparece al
  recargar. En la base solo queda cifrada, así que no hay dónde ir a buscarla.
- **Generar una clave nueva para un proyecto que ya tenía deja mudo su cron**
  hasta que alguien cambie su `HUB_API_KEY`. La pantalla lo dice antes de
  hacerlo, porque el fallo es silencioso: no se rompe nada visible, simplemente
  dejan de llegar datos.
- **Una moneda en blanco no borra la que hubiera.** La API solo acepta un ISO
  4217 de tres letras y no hay forma de dejarla en nulo; hay sitios que no
  facturan y nunca la tuvieron.

## Stack y sus rarezas

- **NestJS 12 es ESM puro.** Por eso los tests corren con **Vitest** y no con
  Jest: el runtime de Jest necesita Node ≥24.9 para poder `require()` un
  paquete ESM. El código propio sigue compilando a CommonJS, que Node carga sin
  problema.
- **Prisma 7 saca la URL del schema.** El CLI la lee de `prisma.config.ts`; el
  cliente la recibe por driver adapter en `src/prisma/prisma.service.ts`.
- **Las columnas van en snake_case** (`@map`) aunque el código sea camelCase:
  la capa de ingesta escribe SQL crudo y así se lee igual desde `psql`.
- **Los timestamps de las migraciones son UTC.** Si se crea una migración a
  mano con `date +%Y%m%d%H%M%S` (hora local) puede ordenarse antes que la
  anterior y aplicarse fuera de orden. Usar `date -u`.
- **Hay dos tsconfig.** `tsconfig.json` cubre `src/`, `prisma/` y los configs
  de la raíz (editor, lint, `pnpm typecheck`); `tsconfig.build.json` solo
  `src/`, y es el único que fija `rootDir`. Si `prisma/` entrase en el programa
  del build, la salida se iría a `dist/src/main.js` y `start:prod` no lo
  encontraría.
- **`pnpm build` no comprueba `prisma/seed.ts`** — para eso está
  `pnpm typecheck`.

## Comandos

```bash
cd api
pnpm start:dev                  # desarrollo con recarga
pnpm build && pnpm start:prod   # como en producción
pnpm test                       # Vitest
pnpm typecheck                  # tsc --noEmit: cubre también seed y specs
pnpm lint
pnpm prisma migrate dev         # nueva migración
pnpm seed                       # idempotente
pnpm seed:demo                  # métricas sintéticas para desarrollo
pnpm rollup [slug] [de] [a]     # consolidar eventos sin esperar al cron de las 03:00

cd ../web
pnpm dev                        # panel en :3000
pnpm typecheck && pnpm lint
```
