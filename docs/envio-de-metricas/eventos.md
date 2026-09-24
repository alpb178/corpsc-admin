# Eventos: sitios sin backend propio

El contrato normal —[`CONTRATO.md`](./CONTRATO.md)— asume que el proyecto puede
calcular sus agregados diarios. El portfolio del grupo y los sitios de cliente
son páginas en Vercel **sin base de datos**: no tienen dónde contar ni desde
dónde agregar.

Para ellos el hub abre una segunda puerta: **mandan el hecho suelto y el hub lo
consolida en unos segundos** en las mismas métricas diarias que envía todo el mundo.

```
POST https://hub.corpsc.com/api/ingest/events
X-Api-Key: <la clave del proyecto>
Content-Type: application/json
```

El ejemplo completo, con los cuatro tipos de evento, está en
[`ejemplo-eventos.json`](./ejemplo-eventos.json) y tiene un test que lo valida
contra el contrato real: si se separan, falla el build del hub.

```jsonc
{
  "schemaVersion": 2,
  "events": [
    { "type": "page_view", "eventId": "0b6f1c1e-…", "sessionId": "9f2c…", "visitorId": "4d8e…",
      "path": "/es/servicios", "country": "BO", "region": "L", "city": "La Paz",
      "device": "mobile", "browser": "Chrome", "os": "Android", "language": "es", "screen": "sm",
      "referrer": "google.com", "utmSource": "instagram", "utmMedium": "social",
      "utmCampaign": "otono", "at": "2026-09-21T15:04:01.000Z" },
    { "type": "click", "eventId": "5a1e…", "sessionId": "9f2c…", "path": "/es/servicios",
      "section": "hero", "label": "Ver proyectos", "at": "2026-09-21T15:04:10.000Z" },
    { "type": "site_click", "eventId": "c7b3…", "sessionId": "9f2c…", "path": "/es/servicios",
      "section": "projects", "label": "Take",
      "target": "take", "linkType": "web", "at": "2026-09-21T15:04:22.000Z" },
    { "type": "custom", "eventId": "e2d4…", "sessionId": "9f2c…", "path": "/es/contacto",
      "name": "contact_submit", "props": { "topic": "presupuesto" }, "at": "2026-09-21T15:06:40.000Z" }
  ]
}
```

Respuesta: `202` con `{ "accepted": 4, "duplicates": 0 }`. `duplicates` cuenta
los eventos cuyo `eventId` ya estaba guardado: un beacon reenviado no se
guarda dos veces.

### Versiones

- **v1**: `page_view`, `click` y `site_click`, con sesión, país y origen.
- **v2** añade, todo opcional: `eventId`, `visitorId`, `device`, `browser`, `os`,
  `region`, `city`, `language`, `screen` y el tipo `custom`. El hub acepta las
  dos a la vez, así que cada sitio migra cuando le toca.


### De dónde sale `section` y `label`

El beacon de cada sitio escucha los clics en el documento, sobre enlaces y
botones, y los resuelve así:

- **`section`**: el `data-track-section` más cercano hacia arriba. Si no hay,
  el `id` de la `<section>` que lo contiene, o el landmark: `header`, `nav`,
  `footer`, `aside`, `main`.
- **`label`**: el `data-track-label` del elemento. Si no hay, su `aria-label`,
  su texto (espacios colapsados, hasta 120 caracteres) o el `alt` de su imagen.

Para que un bloque se lea bien en el panel basta con marcarlo:
`<section data-track-section="pricing">`. Nunca se manda lo que alguien
escribe en un campo: solo la etiqueta de botones y enlaces.

## Reglas

| Regla | Por qué |
|---|---|
| Máximo **50 eventos** por petición | Un sitio que necesite más está mandando mal los eventos |
| `sessionId` de 8 a 64 caracteres, opaco | Es lo que evita contar cinco páginas como cinco visitas. **No identifica a una persona** |
| `target` obligatorio en `site_click` | Un clic sin destino no se puede desglosar y solo engorda un cubo anónimo |
| `section` y `label` obligatorios en `click` (opcionales en `site_click`) | Un clic que no dice dónde se hizo no aporta nada sobre contar páginas |
| `linkType`: `web` · `android` · `ios` | Un botón de Google Play no es una visita a la web |
| `at` opcional, y **acotado a 48 h** | Un beacon puede salir al cerrar la pestaña, no dos días después: fuera de esa ventana manda la hora de llegada, para que nadie reescriba un día ya cerrado |
| `eventId`: un UUID por evento, generado en el navegador | Un reintento o un componente montado dos veces no cuentan doble: el hub guarda un solo evento por `eventId` y proyecto |
| `visitorId` de 8 a 64 caracteres, opaco | Lo emite el servidor del sitio en una cookie propia. Distingue un navegador que vuelve de uno nuevo. **No identifica a una persona** |
| `name` obligatorio en `custom`, en snake_case | Es lo que el panel enseña y lo que se marca como conversión |
| `props` solo en `custom`: objeto plano, hasta 10 claves en snake_case, valores de texto (≤ 100), número o booleano, ≤ 1 KB | Sirven para segmentar (`plan`, `paso`), no para transportar datos. Nunca lo que alguien escribe en un formulario |
| `device`: `mobile` · `tablet` · `desktop`; `browser` y `os` como familia (`Chrome`, `Android`) | Los calcula el servidor del sitio a partir del agente de usuario, que **no** se manda |
| `language`: dos letras (`es`, `pt`); `screen`: `xs` · `sm` · `md` · `lg` · `xl` · `xxl` | El idioma principal y el ancho de la ventana por tramos (< 576, < 768, < 992, < 1200, < 1440, resto): útiles sin convertirse en una huella |
| **Límite de envíos**: 600 peticiones por minuto y proyecto (`INGEST_RATE_LIMIT_PER_MINUTE`) | Por encima responde `429`. Se cuenta por clave, no por IP: los sitios comparten IPs de su hosting |

### País, procedencia y horario

- **`country`**, **`region`** y **`city`**: los pone la ruta de servidor del
  sitio a partir de las cabeceras `x-vercel-ip-country`,
  `x-vercel-ip-country-region` y `x-vercel-ip-city` de Vercel, en todos los
  eventos. La IP no sale nunca del sitio.
- **`referrer`**: solo en la primera página vista de cada carga, y solo el
  **dominio** (`google.com`), nunca la URL entera, que puede llevar búsquedas o
  identificadores. Si el origen es el propio sitio, no se manda.
- **`utmSource`, `utmMedium`, `utmCampaign`**: los `utm_*` de la URL de entrada,
  en la misma página vista.
- **El horario no se manda**: sale de `at`, en la zona horaria del proyecto.

**Lo que no se manda nunca:** ni IP, ni agente de usuario, ni la URL de origen
entera, ni nada que identifique a quien navega. El hub no lo guarda porque no
lo recibe.

## Qué sale de ahí

Cada envío pide una consolidación **en vivo** de ese proyecto: a los diez
segundos se rehacen los tres últimos días —los que puede tocar un evento
aceptado— y el panel ya lo refleja. Los envíos que llegan en esa espera se
suman a la misma pasada. Además, a las **03:00** se rehacen **los últimos cuatro
días** de todos, como red por si alguna en vivo falló. Produce exactamente
cuatro métricas:

> Los campos de la v2 (visitante, dispositivo, región, ciudad, idioma, pantalla
> y eventos `custom`) ya se guardan, pero la consolidación todavía no los
> desglosa: llegan en la siguiente fase, con las métricas `new_visitors`,
> `custom_events` y `conversions`.

| Métrica | De dónde sale | Desglose |
|---|---|---|
| `visits` | sesiones distintas del día | — |
| `page_views` | eventos `page_view` | por `path` |
| `site_clicks` | eventos `site_click` | por `project` (destino) y por `link_type` |
| `clicks` | eventos `click` y `site_click` | por `path` y por `element` (`ruta \| sección \| etiqueta`) |

Además, **`visits`** se desglosa por `country`, `channel` (búsqueda orgánica,
redes, directo, referencia… con los nombres de canal de GA4), `source`
(`utmSource` o dominio de origen), `campaign` y `hour` (`00`–`23`), y
**`page_views`** por `hour`. Cada visita cuenta una vez, con lo que traía su
primer evento del día, así que cada desglose suma el total: las visitas sin
país van a `__unknown__` y las directas a `__direct__`.

El día se decide **en la zona horaria del proyecto**, no en UTC: por eso el
evento se guarda con su instante y no con una fecha ya recortada. Si la zona de
un proyecto estaba mal puesta, se corrige en Ajustes y se vuelve a consolidar.

Lo crudo se conserva **90 días** y se borra solo. Está ahí para poder recalcular
—filtrar un bot que se descubre tarde, corregir una zona— cosa que un contador
incrementado sobre la marcha no permitiría.

## Lo que hay que tener claro

- **Un proyecto que ya empuja agregados no debe usar esta puerta para las
  mismas métricas.** Su envío reemplaza la ventana entera y borraría lo
  consolidado desde eventos. Las dos vías conviven en el hub, no en el mismo
  proyecto.
- **Sin eventos no se escribe nada.** Un sitio callado no es un sitio con cero
  visitas: puede ser que nadie haya entrado o que los beacons estén rotos.
  Escribir ceros haría indistinguibles las dos cosas, así que el proyecto
  aparece como callado en **Envíos**, que es exactamente lo que pasa.
- **La clave no puede viajar al navegador.** El sitio manda los beacons a una
  ruta suya, en su propio servidor, y es esa ruta la que llama al hub con la
  clave. Ponerla en el cliente sería publicarla.

## Implementación de referencia

`corpsc-portfolio`: `src/app/api/track/route.ts` (recoge y reenvía) y
`src/components/Analytics.tsx` (visita y clics salientes).
