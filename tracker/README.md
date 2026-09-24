# hub-tracker

El tracker del hub, **una sola fuente para los cinco sitios**. Aquí se escribe y
se prueba; cada sitio recibe una copia con `pnpm sync` que no se edita a mano.

| Archivo | Qué hace | Dónde corre |
|---|---|---|
| `HubAnalytics.tsx` | Page view por ruta y clics en todo el documento | navegador |
| `client.ts` | Cola: agrupa, envía cada 5 s o al ocultar la página (`sendBeacon`), un reintento; `track()` para eventos propios | navegador |
| `handler.ts` | La ruta `/api/hub-track` del sitio: cookies de visita y visitante, país/región/ciudad de Vercel, dispositivo/navegador/SO, límite por IP, reenvío al hub con la clave | servidor del sitio |
| `contract.ts`, `path.ts`, `user-agent.ts`, `visit-origin.ts`, `click-target.ts`, `group-sites.ts` | Piezas compartidas | los dos |

Contrato con el hub: [`docs/envio-de-metricas/eventos.md`](../docs/envio-de-metricas/eventos.md) (v2).

## Llevarlo a un sitio

```bash
cd corpsc-hub/tracker
pnpm install
pnpm sync ../../tu-chamba/web/src/lib/hub-tracker
```

En un sitio cuyo runner de tests es el de Node (`node --test`, como Invoices),
`pnpm sync <carpeta> --runner=node`.

Copia los archivos con una cabecera `GENERATED`, un `MANIFEST.json` con el hash
de cada uno y un `integrity.test.ts` que falla si alguien edita la copia. El
arreglo va aquí y se vuelve a sincronizar en los cinco.

En el sitio quedan dos archivos propios, de tres líneas:

```ts
// app/api/hub-track/route.ts
import { after } from 'next/server'; // Next ≥ 15.1; en Next 14, sin `after`
import { createHubTrackHandler } from '@/lib/hub-tracker/handler';

export const POST = createHubTrackHandler({ after });
```

```tsx
// en el layout raíz
import { HubAnalytics } from '@/lib/hub-tracker/HubAnalytics';

<HubAnalytics
  locales={['es', 'en', 'pt']}
  privateSegments={['admin', 'account']}
  pathPatterns={['/listings/:id']}
/>
```

Y para un evento propio, desde cualquier componente de cliente:

```ts
import { track } from '@/lib/hub-tracker/client';

track('contact_submit', { topic: 'presupuesto' });
```

Que cuente como **conversión** se decide en el hub (`PUT /api/projects/:slug/goals/contact_submit`),
no en el sitio: cambiar un objetivo no obliga a redesplegar.

Entorno del sitio: `HUB_URL` y `HUB_API_KEY`, **nunca** `NEXT_PUBLIC_`.

## Qué garantiza

- **Rápido.** Nada corre antes de que la página sea interactiva; un lote es una
  petición en lugar de una por clic; con `after()` la respuesta sale antes de
  llamar al hub.
- **Silencioso.** Todo fallo se traga. La ruta responde siempre 204.
- **Resiliente.** Al ocultar o cerrar la página la cola sale con `sendBeacon`;
  un lote que falla se reintenta una vez con los mismos `eventId`, y el hub
  descarta la copia si el primero sí llegó.
- **Sin datos de más.** Ni IP ni agente de usuario salen del sitio; del origen,
  solo el dominio; en zonas privadas, solo etiquetas escritas por el equipo.
- **Solo la propia página.** Una petición de otro origen, o sin decir de dónde
  viene, se descarta. No frena a quien falsifique cabeceras con curl —para eso
  está el límite por IP en el sitio y por clave en el hub—, pero sí a cualquier
  otra web que quiera inflar nuestros números.

## Desarrollo

```bash
pnpm test        # Vitest (jsdom; el handler en node)
pnpm test:cov    # falla por debajo del 95 %
pnpm typecheck   # con el mismo tsconfig base que los sitios
```
