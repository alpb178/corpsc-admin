import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

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
