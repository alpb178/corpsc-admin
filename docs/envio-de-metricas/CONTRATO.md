# Contrato de envío de métricas

Todas las estadísticas del hub entran por aquí. Cada proyecto del grupo calcula
sus **agregados diarios** y los envía; el hub no sale a buscar nada.

> ¿Un sitio sin base de datos donde agregar —una página en Vercel, un sitio de
> cliente? Entonces no es este contrato, sino [`eventos.md`](./eventos.md): manda
> el hecho suelto y el hub lo consolida.

```
POST https://hub.corpsc.com/api/ingest/metrics
X-Api-Key: <la clave del proyecto>
Content-Type: application/json
```

El hub **valida el envío** y devuelve 400 si no encaja, en lugar de guardar
datos mal formados. Más vale un cron en rojo que un número equivocado en una
presentación.

---

## Lo que hay que enviar

```jsonc
{
  "schemaVersion": 1,
  "project": "tu-chamba",          // informativo: quien manda es la clave
  "timezone": "America/La_Paz",
  "generatedAt": "2026-04-01T09:00:00.000Z",

  // El periodo que cubre este envío. El hub REEMPLAZA exactamente ese rango.
  "range": { "from": "2026-03-01", "to": "2026-03-02" },

  // Autodescripción: el hub aprende métricas nuevas sin desplegar nada.
  "definitions": [
    { "key": "visits",       "label": "Visitas",        "unit": "count" },
    { "key": "page_views",   "label": "Páginas vistas", "unit": "count" },
    { "key": "orders",       "label": "Pedidos",        "unit": "count" },
    { "key": "revenue",      "label": "Ingresos",       "unit": "currency", "currency": "BOB" }
  ],

  "days": [
    {
      "date": "2026-03-01",
      "metrics": { "visits": 254, "page_views": 661, "orders": 12, "revenue": 3450.50 },
      "breakdowns": [
        { "metric": "visits", "dimension": "country", "values": { "BO": 198, "AR": 56 } },
        { "metric": "orders", "dimension": "status",  "values": { "paid": 9, "pending": 3 } }
      ]
    }
  ]
}
```

### Respuesta

```jsonc
{ "runId": "…", "status": "SUCCESS", "rowsWritten": 8, "rowsDeleted": 0, "warnings": [] }
```

`status` es `PARTIAL` si hubo avisos (zona horaria distinta, métricas sin
declarar, desgloses recortados). Los avisos se ven en **Envíos** del panel.

### Campos

| Campo | Regla |
|---|---|
| `schemaVersion` | Siempre `1`. Si cambia el contrato, cambia este número |
| `timezone` | La zona en la que se han recortado los días. **Nunca UTC por defecto** |
| `range` | Periodo que cubre el envío. Máximo 92 días |
| `definitions[].key` | `snake_case`, 2-64 caracteres, empieza por letra |
| `definitions[].unit` | `count` · `currency` · `seconds` · `ratio` |
| `definitions[].aggregation` | `sum` (por defecto) · `last` · `max` |
| `definitions[].currency` | ISO 4217. Obligatorio si `unit` es `currency`, **salvo** que la métrica venga desglosada por `currency` (ver regla 5) |
| `breakdowns[].dimension` | `snake_case`, 2-32 caracteres, máx. 100 valores por día |

Una métrica que el hub no conozca se registra **desactivada**: se guarda igual
—el dato no se pierde— pero no se muestra hasta que alguien decida cómo se
llama y cómo se formatea.

---

## Las seis reglas

Son las que, si cada equipo interpreta a su aire, producen números que no
cuadran entre proyectos.

1. **Días calendario en la `timezone` declarada, nunca UTC.** Un desajuste
   horario desplaza las series un día frente a los demás sitios y no se nota
   hasta que alguien compara. Iris ya lo hace bien: `AT TIME ZONE` en
   `orders.service.ts:226`.

2. **`range` manda: el hub reemplaza ese periodo entero.** Lo que no venga
   dentro de él, se borra. Es lo que hace que reenviar un día corrija los
   datos en vez de duplicarlos.

3. **Agregados del día, no acumulados.** `orders: 12` es "doce pedidos ese
   día", no "doce en lo que va de mes". La excepción explícita es
   `aggregation: "last"`, para fotos del momento como el total de usuarios.

4. **Estado actual, no histórico.** Si un pedido del día 1 se cancela el día 5,
   el siguiente envío que cubra el día 1 debe reflejarlo. Por eso conviene
   reenviar siempre los últimos días, no solo el de ayer.

5. **Prohibido convertir divisa.** Se envía en la moneda real, con su código.

   - **Una sola moneda**: se declara en `definitions[].currency`.
   - **Varias monedas**: se manda un desglose con `dimension: "currency"`, y
     cada valor de la dimensión ES el código de moneda. En ese caso **no se
     manda total** en `metrics`: un importe que mezcla dólares y pesos es un
     número sin significado.

   ```jsonc
   // take, que cobra en USD y en CUP
   "definitions": [{ "key": "revenue", "label": "Ingresos", "unit": "currency" }],
   "days": [{
     "date": "2026-03-01",
     "metrics": { "orders": 12 },
     "breakdowns": [
       { "metric": "revenue", "dimension": "currency", "values": { "USD": 210.0, "CUP": 84000.0 } }
     ]
   }]
   ```

   El hub se niega a sumar monedas distintas, y avisa si recibe un importe que
   no declara moneda ni viene desglosado por ella.

6. **Solo agregados.** Ni correos, ni nombres, ni identificadores de cliente,
   ni user-agents. Si un valor de dimensión puede identificar a una persona,
   no va.

**Un envío vacío sobre un periodo que ya tenía datos se rechaza**, no lo borra:
si de verdad no hubo actividad, hay que mandar los días con valores a cero.

---

## Qué debe enviar cada proyecto

| Proyecto | Tráfico (de su propio registro) | Negocio |
|---|---|---|
| **tu-chamba** | `Visit`, `PageView`, `SiteClick` | publicaciones (`Ad`), contactos (`Interest`), altas (`User`) |
| **Iris Natural** | `page_visits`, `store_events` | pedidos e ingresos (`orders`) |
| **toma** | `activity_logs` (con país por geo-IP) | pedidos, ingresos USD/CUP, contactos (`contact_messages`) |
| **invoice-gen** | — (no tiene tracking propio) | facturas por estado, importes |

Nombres de métrica que el hub ya conoce: `visits`, `page_views`,
`unique_visitors`, `orders`, `orders_paid`, `revenue`, `leads`, `signups`,
`publications`, `invoices`. Cualquier otra se acepta y queda pendiente de
revisar.

---

## Cómo obtener la clave

Un administrador la crea en el panel (o por API) y se la asigna al proyecto:

```bash
curl -X POST https://hub.corpsc.com/api/credentials \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"label":"Tu Chamba (envío)"}'
# → devuelve `secret` UNA sola vez; después queda cifrada y no se puede leer

curl -X PUT https://hub.corpsc.com/api/projects/tu-chamba/credential/<id> \
  -H "Authorization: Bearer $TOKEN"
```

La clave identifica al proyecto: **el campo `project` del cuerpo es
informativo**. Un proyecto no puede escribir datos de otro aunque lo intente.

En el repo va como `HUB_API_KEY`, y la URL como `HUB_URL`.

---

## Implementaciones de referencia

- [`nestjs.md`](./nestjs.md) — para `tu-chamba` e `Iris Natural`
- [`strapi.md`](./strapi.md) — para `toma` e `invoice-gen`
- [`ejemplo.json`](./ejemplo.json) — envío válido, útil como fixture de test
