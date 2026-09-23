import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

/**
 * Contrato de los sitios que no tienen dónde agregar.
 *
 * El portfolio del grupo y los sitios de cliente son páginas en Vercel sin
 * base de datos: no pueden calcular sus agregados diarios como hacen Take o
 * Tu Chamba. En lugar del resumen del día mandan el hecho suelto, y el hub lo
 * consolida cada noche en las mismas métricas que envía todo el mundo.
 *
 * Lo que NO va aquí: nada que identifique a una persona. Ni IP, ni agente de
 * usuario, ni referer. La sesión es un identificador opaco que emite el propio
 * sitio y que solo sirve para no contar cinco páginas como cinco visitas.
 */

/** Por petición. Un sitio que necesite más está mandando mal los eventos. */
export const MAX_EVENTS_PER_REQUEST = 50;

/**
 * Un evento más viejo que esto se recorta a la hora de llegada.
 *
 * Un beacon puede retrasarse segundos al cerrar la pestaña, no dos días: una
 * fecha muy anterior es un reloj mal puesto o un reenvío, y aceptarla tal cual
 * reescribiría un día que ya se dio por cerrado.
 */
export const MAX_EVENT_AGE_HOURS = 48;

export const SITE_EVENT_KINDS = ['page_view', 'site_click', 'click'] as const;
export type SiteEventKind = (typeof SITE_EVENT_KINDS)[number];
export type LinkType = 'web' | 'android' | 'ios';

export class SiteEventDto {
  @ApiProperty({ enum: SITE_EVENT_KINDS })
  @IsIn(SITE_EVENT_KINDS)
  type!: SiteEventKind;

  @ApiProperty({ description: 'Identificador opaco de la visita, no de la persona' })
  @IsString()
  @Length(8, 64)
  sessionId!: string;

  @ApiProperty({ example: '/es' })
  @IsString()
  @Length(1, 512)
  path!: string;

  @ApiPropertyOptional({
    description: 'Solo en site_click: slug del proyecto del grupo al que va el clic',
    example: 'take',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  target?: string;

  @ApiPropertyOptional({ enum: ['web', 'android', 'ios'] })
  @IsOptional()
  @IsIn(['web', 'android', 'ios'])
  linkType?: LinkType;

  @ApiPropertyOptional({
    description: 'En los clics: zona de la página donde ocurrió. Obligatorio en click',
    example: 'hero',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  section?: string;

  @ApiPropertyOptional({
    description: 'En los clics: texto del botón o enlace. Obligatorio en click',
    example: 'Ver proyectos',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @ApiPropertyOptional({ description: 'Instante del evento en ISO 8601. Por defecto, el de llegada' })
  @IsOptional()
  @IsISO8601()
  at?: string;
}

export class SiteEventsDto {
  @ApiProperty({ example: 1, description: 'Siempre 1. Si cambia el contrato, cambia este número' })
  @Equals(1)
  schemaVersion!: number;

  @ApiProperty({ type: [SiteEventDto], maxItems: MAX_EVENTS_PER_REQUEST })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVENTS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => SiteEventDto)
  events!: SiteEventDto[];
}
