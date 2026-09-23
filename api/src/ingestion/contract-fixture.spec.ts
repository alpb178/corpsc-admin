import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InternalMetricsDto, SCHEMA_VERSION } from './contract';

/**
 * The example handed to the four teams has to pass the real validation. If
 * the docs and the code drift apart, each team will implement what the
 * example says and the hub will reject it.
 */
describe('docs/envio-de-metricas/ejemplo.json', () => {
  // Relative to the `api/` root, which is vitest's root.
  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), '../docs/envio-de-metricas/ejemplo.json'), 'utf8'),
  ) as unknown;

  it('satisfies the contract the hub validates', async () => {
    const dto = plainToInstance(InternalMetricsDto, fixture);
    const errors = await validate(dto);

    expect(errors.flatMap((e) => Object.values(e.constraints ?? {}))).toEqual([]);
  });

  it('declares the version the hub understands', () => {
    expect((fixture as { schemaVersion: number }).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('declares a currency on amount metrics', () => {
    // Without it the hub can't aggregate, and the reference would teach doing it wrong.
    const defs = (fixture as { definitions: Array<{ unit: string; currency?: string }> }).definitions;
    for (const def of defs.filter((d) => d.unit === 'currency')) {
      expect(def.currency).toBeTruthy();
    }
  });
});
