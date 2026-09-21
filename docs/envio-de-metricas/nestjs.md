# Referencia NestJS + Prisma

Para `tu-chamba` e `Iris Natural`. Un módulo nuevo con un cron que, cada
madrugada, calcula los agregados y los envía al hub.

## 1. Servicio

```ts
// src/hub/hub.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const TZ = 'America/La_Paz';
/**
 * Se reenvían siempre los últimos días, no solo el de ayer: un anuncio dado de
 * baja o un contacto marcado como atendido cambian el agregado de días
 * anteriores, y el hub reemplaza la ventana entera.
 */
const REENVIAR_DIAS = 3;

interface DayRow { day: string; value: number }

@Injectable()
export class HubService {
  private readonly logger = new Logger(HubService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** De madrugada, cuando el día anterior ya está cerrado. */
  @Cron('0 30 4 * * *', { timeZone: TZ, name: 'hub-push' })
  async push(): Promise<void> {
    const url = process.env.HUB_URL;
    const key = process.env.HUB_API_KEY;
    // Sin configurar, el servicio es un no-op: un entorno de desarrollo no
    // tiene por qué mandar nada al hub.
    if (!url || !key) return;

    const to = this.localDay(-1);
    const from = this.localDay(-REENVIAR_DIAS);

    try {
      const payload = await this.build(from, to);

      const response = await fetch(`${url}/api/ingest/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
      }

      const result = (await response.json()) as { rowsWritten: number; warnings: string[] };
      this.logger.log(`Enviado ${from}…${to}: ${result.rowsWritten} filas`);
      for (const w of result.warnings) this.logger.warn(w);
    } catch (error) {
      // No se relanza: que el hub esté caído no puede tumbar el scheduler del
      // proyecto. El hub detecta el silencio por su cuenta.
      this.logger.error(`Fallo al enviar al hub: ${(error as Error).message}`);
    }
  }

  private async build(from: string, to: string) {
    const [visits, pageViews, ads, interests, users] = await Promise.all([
      this.daily('"Visita"', from, to),
      this.daily('"PaginaVista"', from, to),
      this.daily('"Anuncio"', from, to),
      this.daily('"Interes"', from, to),
      this.daily('"User"', from, to),
    ]);

    const days = new Map<string, Record<string, number>>();
    const put = (rows: DayRow[], key: string) => {
      for (const row of rows) {
        const bucket = days.get(row.day) ?? {};
        bucket[key] = Number(row.value);
        days.set(row.day, bucket);
      }
    };

    put(visits, 'visits');
    put(pageViews, 'page_views');
    put(ads, 'publications');
    put(interests, 'leads');
    put(users, 'signups');

    return {
      schemaVersion: 1,
      project: 'tu-chamba',
      timezone: TZ,
      generatedAt: new Date().toISOString(),
      // `range` manda: el hub reemplaza exactamente este periodo.
      range: { from, to },
      definitions: [
        { key: 'visits',       label: 'Visitas',        unit: 'count' },
        { key: 'page_views',   label: 'Páginas vistas', unit: 'count' },
        { key: 'publications', label: 'Publicaciones',  unit: 'count' },
        { key: 'leads',        label: 'Contactos',      unit: 'count' },
        { key: 'signups',      label: 'Altas',          unit: 'count' },
      ],
      days: [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, metrics]) => ({ date, metrics })),
    };
  }

  /**
   * Conteo por día LOCAL. El recorte lo hace Postgres, no JavaScript: así el
   * día no depende de la zona horaria del proceso y no hay que traerse miles
   * de filas para contarlas.
   *
   * El nombre de tabla va concatenado porque Postgres no admite parámetros
   * para identificadores; solo se pasan literales escritos en este archivo.
   * Si algún día saliera de una petición, sería una inyección SQL.
   */
  private daily(table: string, from: string, to: string): Promise<DayRow[]> {
    return this.prisma.$queryRawUnsafe<DayRow[]>(
      `SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day,
              count(*)::int AS value
         FROM ${table}
        WHERE ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
        GROUP BY 1 ORDER BY 1`,
      from, to, TZ,
    );
  }

  /** Día local con desplazamiento: -1 es ayer. */
  private localDay(offset: number): string {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + offset);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
  }
}
```

## 2. Módulo

```ts
// src/hub/hub.module.ts
import { Module } from '@nestjs/common';
import { HubService } from './hub.service';

@Module({ providers: [HubService] })
export class HubModule {}
```

Añadir `HubModule` a `imports` de `app.module.ts`. `ScheduleModule.forRoot()`
ya está.

## 3. Variables de entorno

```bash
# .env y .env.example
HUB_URL=https://hub.corpsc.com
HUB_API_KEY=
```

En Render, ambas con `sync: false` para introducirlas a mano.

## 4. Comprobarlo

```bash
# Forzar un envío sin esperar al cron: expón un endpoint temporal de admin,
# o llama al servicio desde `nest console`.
```

Contrastar un día a mano contra el panel de administración del propio proyecto
antes de dar el envío por bueno: si el recorte horario está mal, los números
bailan un día y no se nota hasta que alguien compara dos sitios.

## Para Iris Natural

Igual, cambiando el servicio: `orders.service.ts:218 getStats()` ya devuelve la
serie diaria con ingresos, y `tracking.service.ts` el tráfico de `page_visits`.
Las métricas serían `visits`, `page_views`, `orders`, `orders_paid` y `revenue`
(con `currency: "BOB"`), más el desglose por `status` del pedido.
