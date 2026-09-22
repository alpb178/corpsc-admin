# Integraciones: quién manda qué, y cómo se da de alta una nueva

Registro canónico de cómo entra el dato de cada sitio del grupo. Si aquí y el
código no coinciden, manda el código y hay que corregir este documento.

## El modelo

**Cada front manda sus eventos; los backends de los proyectos no se tocan.**

```
front del proyecto              hub
  visita     ─┐
  clic       ─┴─▶ /api/hub-track ──▶ POST /api/ingest/events
                  (ruta de servidor,   X-Api-Key
                   con la clave)       └─ site_event (crudo, 90 días)
                                              │
                                    cron 03:00 ┴──▶ metric_daily
```

Por qué así y no con un cron en cada backend, que fue la primera versión:

- **Un front no necesita base de datos.** Diez de los quince sitios no tienen
  dónde agregar —son páginas en Vercel— y con eventos no les hace falta.
- **La integración es la misma en los cinco repos**, archivo por archivo. Un
  cron por backend eran cuatro implementaciones distintas contra cuatro
  esquemas distintos.
- **Se toca el front, que es de quien es la métrica.** Una visita y un clic
  ocurren en el navegador; el backend solo se enteraba de rebote.

Lo que se paga por ello está en [Lo que no se mide](#lo-que-no-se-mide).

## Estado por sitio

| Sitio | slug | Puerta | Estado | Dónde vive |
|---|---|---|---|---|
| CORPSC | `corpsc` | eventos | ✅ | `corpsc-portfolio` — `src/components/Analytics.tsx` |
| Tu Chamba | `tu-chamba` | eventos | ✅ | `tu-chamba/web` — `src/components/HubAnalytics.tsx` |
| Iris Natural | `iris-natural` | eventos | ✅ | `Iris Natural/front` — `components/analytics/hub-analytics.tsx` |
| Take | `take` | eventos | ✅ | `toma/fronted` — `components/analytics/hub-analytics.tsx` |
| Invoices | `invoices` | eventos | ✅ | `invoice-gen/frontend` — `src/components/HubAnalytics.tsx` |

Los `slug` de esta tabla son los que manda `api/prisma/seed.ts`. **Son ellos los
que deciden con qué nombre se guarda un clic**, no el cintillo de cada repo: un
`dando-muela` frente a un `dandomuela` partiría la misma métrica en dos cubos.

## Qué se mide

| Métrica | Qué es | Desglose |
|---|---|---|
| `visits` | Sesiones distintas del día | — |
| `page_views` | Páginas vistas | por `path` |
| `site_clicks` | Clics que se van a otro sitio del grupo | por `project` de destino y por `link_type` |

Las tres salen de la consolidación de las 03:00, que es dueña de ellas y de
ninguna más. Detalle del contrato en [`eventos.md`](./eventos.md).

## Lo que no se mide

Pedidos, ingresos, facturas y cancelaciones. **Un navegador no ve un cobro**, ni
una cancelación tres días después, ni un pedido que pasa de pendiente a
confirmado. Eso solo lo sabe el backend de cada proyecto.

Estaba implementado —cuatro cron que empujaban agregados diarios— y se retiró al
elegir este modelo. No se ha borrado: cada repo lo conserva en su rama
`feature/hub-metrics-push`, sin integrar. El contrato de esa puerta sigue vivo y
documentado en [`CONTRATO.md`](./CONTRATO.md); el día que alguien necesite
ingresos en el panel, se recupera esa rama.

Si se recupera, hay una cosa que arreglar antes: el envío por `/ingest/metrics`
**reemplaza la ventana entera**, así que borraría las visitas que el front haya
mandado por eventos. Habría que acotar su reemplazo a las métricas que declara,
igual que ya hace la consolidación con `ownedMetricKeys`.

## Dar de alta un sitio nuevo

1. **Registrarlo** en `api/prisma/seed.ts` con su slug, nombre y dominio, y
   `pnpm seed`. El slug es el mismo de `corpsc-portfolio/src/content/projects.ts`.
2. **Ajustes → Proyectos** en el panel: zona horaria (la del sitio, no la tuya)
   y moneda si factura.
3. **Generar la clave** ahí mismo. Se enseña una sola vez.
4. **Copiar la integración** de cualquiera de los cinco repos ya integrados: el
   `lib/hub-analytics.ts`, el componente y `app/api/hub-track/route.ts`.
   Montar el componente en el layout raíz.
5. **Configurar el entorno** del front: `HUB_URL` y `HUB_API_KEY`. Nunca en una
   variable `NEXT_PUBLIC_`: quien tenga la clave puede escribir métricas de ese
   proyecto.
6. **Comprobar** que llega: el sitio aparece en **Envíos** del panel al día
   siguiente de la primera consolidación. Mientras no llegue nada, figura como
   que nunca ha enviado — que es la verdad.

Un sitio que no sea Next.js necesita lo mismo con otra forma: cualquier servidor
propio que reciba el beacon y reenvíe con la clave. Lo que no vale es llamar al
hub desde el navegador.
