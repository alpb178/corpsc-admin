import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, MinLength } from 'class-validator';

export class CreateCredentialDto {
  @ApiProperty({ example: 'Tu Chamba (envío)' })
  @IsString()
  @Length(2, 120)
  label!: string;

  @ApiPropertyOptional({
    description:
      'The plaintext key. If omitted, the hub generates a secure one and returns it ' +
      'only ONCE: after that it is stored encrypted and cannot be read again.',
  })
  @IsOptional()
  @IsString()
  @MinLength(24, { message: 'Una clave de envío debe tener al menos 24 caracteres' })
  secret?: string;
}
