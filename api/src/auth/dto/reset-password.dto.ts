import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  password!: string;
}
