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
 * Contract of `POST /api/ingest/metrics`.
 *
 * Four teams implement it in four different repos, so it's properly validated
 * on arrival: better to return a 400 than to store malformed data that nobody
 * will spot until an odd number shows up in a presentation.
 *
 * `schemaVersion` exists so the contract can change later without the hub
 * having to guess what it's reading.
 */
export const SCHEMA_VERSION = 1;

export type MetricUnitName = 'count' | 'currency' | 'seconds' | 'ratio';
export type AggregationName = 'sum' | 'last' | 'max';

export class MetricDefinitionDto {
  /** Stable identifier: lowercase letters, digits and underscores. */
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

  /** Required when unit is `currency`: without it, it can't be aggregated. */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class BreakdownDto {
  @IsString()
  @Length(1, 64)
  metric!: string;

  /** Name of the dimension: status, type, plan, currency… */
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

  /** Timezone the days were cut in. Never UTC by default. */
  @IsString()
  timezone!: string;

  @IsOptional()
  @IsString()
  generatedAt?: string;

  /**
   * Period the push covers. The hub REPLACES exactly that range: whatever
   * isn't inside it gets deleted.
   *
   * It's optional only for convenience —if missing, it's inferred from the
   * days sent— but declaring it is the right thing to do: without it, a day
   * with no activity can't be told apart from a day the project forgot to include.
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
