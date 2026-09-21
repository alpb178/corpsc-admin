import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InternalMetricsDto, SCHEMA_VERSION } from './contract';

/**
 * El ejemplo que se les da a los cuatro equipos tiene que pasar la validación
 * de verdad. Si la documentación y el código se separan, cada equipo
 * implementará lo que dice el ejemplo y el hub se lo rechazará.
 */
describe('docs/envio-de-metricas/ejemplo.json', () => {
  // Relativo a la raíz de `api/`, que es el root de vitest.
  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), '../docs/envio-de-metricas/ejemplo.json'), 'utf8'),
  ) as unknown;

  it('cumple el contrato que valida el hub', async () => {
    const dto = plainToInstance(InternalMetricsDto, fixture);
    const errors = await validate(dto);

    expect(errors.flatMap((e) => Object.values(e.constraints ?? {}))).toEqual([]);
  });

  it('declara la versión que el hub entiende', () => {
    expect((fixture as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('declara moneda en las métricas de importe', () => {
    // Sin esto el hub no puede agregar y la referencia enseñaría a hacerlo mal.
    const defs = (fixture as { definitions: Array<{ unit: string; currency?: string }> }).definitions;
    for (const def of defs.filter((d) => d.unit === 'currency')) {
      expect(def.currency).toBeTruthy();
    }
  });
});
