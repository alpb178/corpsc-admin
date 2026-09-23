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

```jsonc
{
  "schemaVersion": 1,
  "events": [
    { "type": "page_view",  "sessionId": "9f2c…", "path": "/es", "at": "2026-09-21T15:04:01.000Z" },
    { "type": "site_click", "sessionId": "9f2c…", "path": "/es",
      "target": "take", "linkType": "web", "at": "2026-09-21T15:04:22.000Z" }
  ]
}
```

Respuesta: `202` con `{ "accepted": 2 }`.

## Reglas

| Regla | Por qué |
|---|---|
| Máximo **50 eventos** por petición | Un sitio que necesite más está mandando mal los eventos |
| `sessionId` de 8 a 64 caracteres, opaco | Es lo que evita contar cinco páginas como cinco visitas. **No identifica a una persona** |
| `target` obligatorio en `site_click` | Un clic sin destino no se puede desglosar y solo engorda un cubo anónimo |
| `linkType`: `web` · `android` · `ios` | Un botón de Google Play no es una visita a la web |
| `at` opcional, y **acotado a 48 h** | Un beacon puede salir al cerrar la pestaña, no dos días después: fuera de esa ventana manda la hora de llegada, para que nadie reescriba un día ya cerrado |

**Lo que no se manda nunca:** ni IP, ni agente de usuario, ni referer, ni nada
que identifique a quien navega. El hub no lo guarda porque no lo recibe.

## Qué sale de ahí

Cada envío pide una consolidación **en vivo** de ese proyecto: a los diez
segundos se rehacen los tres últimos días —los que puede tocar un evento
aceptado— y el panel ya lo refleja. Los envíos que llegan en esa espera se
suman a la misma pasada. Además, a las **03:00** se rehacen **los últimos cuatro
días** de todos, como red por si alguna en vivo falló. Produce exactamente
tres métricas:

| Métrica | De dónde sale | Desglose |
|---|---|---|
| `visits` | sesiones distintas del día | — |
| `page_views` | eventos `page_view` | por `path` |
| `site_clicks` | eventos `site_click` | por `project` (destino) y por `link_type` |

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
