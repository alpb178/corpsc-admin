import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Contrato de `POST /api/ingest/metrics`.
 *
 * Lo implementan cuatro equipos en cuatro repos distintos, así que se valida
 * de verdad al recibirlo: mejor devolver un 400 que guardar datos mal formados
 * que nadie detectará hasta que un número raro aparezca en una presentación.
 *
 * `schemaVersion` existe para poder cambiar el contrato más adelante sin que
 * el hub adivine qué está leyendo.
 */
export const SCHEMA_VERSION = 1;

export type MetricUnitName = 'count' | 'currency' | 'seconds' | 'ratio';
export type AggregationName = 'sum' | 'last' | 'max';

export class MetricDefinitionDto {
  /** Identificador estable: minúsculas, números y guiones bajos. */
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/, {
    message: 'key debe ser snake_case, empezar por letra y tener 2-64 caracteres',
  })
  key!: string;

  @IsString()
  @Length(1, 120)
  label!: string;

  @IsIn(['count', 'currency', 'seconds', 'ratio'])
  unit!: MetricUnitName;

  @IsOptional()
  @IsIn(['sum', 'last', 'max'])
  aggregation?: AggregationName;

  /** Obligatorio cuando unit es `currency`: sin esto no se puede agregar. */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class BreakdownDto {
  @IsString()
  @Length(1, 64)
  metric!: string;

  /** Nombre del eje: status, type, plan, currency… */
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,31}$/, { message: 'dimension debe ser snake_case de 2-32 caracteres' })
  dimension!: string;

  /** { "paid": 9, "pending": 3 } */
  @IsObject()
  values!: Record<string, number>;
}

export class DayDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date debe ser YYYY-MM-DD' })
  date!: string;

  @IsObject()
  metrics!: Record<string, number>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BreakdownDto)
  breakdowns?: BreakdownDto[];
}

export class RangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'range.from debe ser YYYY-MM-DD' })
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'range.to debe ser YYYY-MM-DD' })
  to!: string;
}

export class InternalMetricsDto {
  @IsInt()
  schemaVersion!: number;

  @IsString()
  project!: string;

  /** Zona horaria en la que se han recortado los días. Nunca UTC por defecto. */
  @IsString()
  timezone!: string;

  @IsOptional()
  @IsString()
  generatedAt?: string;

  /**
   * Periodo que cubre el envío. El hub REEMPLAZA exactamente ese rango: lo que
   * no venga dentro de él, se borra.
   *
   * Es opcional solo por comodidad —si falta, se deduce de los días
   * enviados—, pero declararlo es lo correcto: sin él, un día sin actividad no
   * se puede distinguir de un día que el proyecto olvidó incluir.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => RangeDto)
  range?: RangeDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricDefinitionDto)
  definitions!: MetricDefinitionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayDto)
  days!: DayDto[];
}
