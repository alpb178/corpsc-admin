import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class RangeDto {
  @ApiProperty({ example: '2026-08-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-08-31' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({
    description: 'Adds the comparison with the previous period of the same length',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  compare?: boolean;
}

export class CompareDto extends RangeDto {
  @ApiProperty({ example: 'take,tu-chamba', description: 'Comma-separated slugs' })
  @IsString()
  slugs!: string;

  @ApiPropertyOptional({ example: 'visits', default: 'visits' })
  @IsOptional()
  @IsString()
  metric?: string;
}

export class VisitorsQueryDto {
  @ApiProperty({ example: '2026-08-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from debe ser YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-08-31' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to debe ser YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({ example: 'tu-chamba', description: 'One site; the whole group if omitted' })
  @IsOptional()
  @IsString()
  project?: string;
}

export class RealtimeQueryDto {
  @ApiPropertyOptional({ example: 'tu-chamba', description: 'One site; the whole group if omitted' })
  @IsOptional()
  @IsString()
  project?: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 60 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(60)
  minutes?: number;
}
