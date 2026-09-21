import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

export class CreateCredentialDto {
  @ApiProperty({ example: 'Tu Chamba (envío)' })
  @IsString()
  @Length(2, 120)
  label!: string;

  @ApiPropertyOptional({
    description:
      'La clave en claro. Si se omite, el hub genera una segura y la devuelve ' +
      'UNA sola vez: después queda cifrada y no se puede volver a leer.',
  })
  @IsOptional()
  @IsString()
  @MinLength(24, { message: 'Una clave de envío debe tener al menos 24 caracteres' })
  secret?: string;
}
