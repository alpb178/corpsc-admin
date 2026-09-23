import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateProjectDto {
  @ApiPropertyOptional({ example: 'Tu Chamba' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ example: 'America/La_Paz' })
  @IsOptional()
  @IsString()
  // Validated against the runtime's timezone list in the service: here we only
  // reject what doesn't even look like a timezone.
  @Matches(/^[A-Za-z]+\/[A-Za-z_+-]+$/, { message: 'timezone debe ser tipo America/La_Paz' })
  timezone?: string;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  @Length(3, 3, { message: 'currency debe ser un código ISO 4217 de 3 letras' })
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
