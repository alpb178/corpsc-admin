import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class UpsertGoalDto {
  @ApiProperty({ example: 'Formulario de contacto', description: 'How the panel names this conversion' })
  @IsString()
  @Length(1, 120)
  label!: string;

  @ApiPropertyOptional({ default: true, description: 'An inactive goal is kept but no longer counted' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
