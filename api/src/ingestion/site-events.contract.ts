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
  Matches,
  ValidateNested,
} from 'class-validator';

/**
 * Contract for the sites that have nowhere to aggregate.
 *
 * The group's portfolio and the client sites are Vercel pages without a
 * database: they can't compute their daily aggregates the way Take or Tu
 * Chamba do. Instead of the day's summary they send the individual fact, and
 * the hub rolls it up into the same metrics everyone else sends.
 *
 * What does NOT go here: anything that identifies a person. No IP, no user
 * agent, no full referring URL. The country arrives already resolved by the
 * site's hosting, and of the origin only the domain and the `utm_*`
 * parameters. The session is an opaque identifier issued by the site itself,
 * used only so five pages aren't counted as five visits.
 */

/** Per request. A site that needs more is sending its events wrong. */
export const MAX_EVENTS_PER_REQUEST = 50;

/**
 * An event older than this is clamped to its arrival time.
 *
 * A beacon can be delayed by seconds when the tab closes, not by two days: a
 * much earlier date is a misconfigured clock or a resend, and accepting it as
 * is would rewrite a day already considered closed.
 */
export const MAX_EVENT_AGE_HOURS = 48;

export const SITE_EVENT_KINDS = ['page_view', 'site_click', 'click'] as const;
export type SiteEventKind = (typeof SITE_EVENT_KINDS)[number];
export type LinkType = 'web' | 'android' | 'ios';

export class SiteEventDto {
  @ApiProperty({ enum: SITE_EVENT_KINDS })
  @IsIn(SITE_EVENT_KINDS)
  type!: SiteEventKind;

  @ApiProperty({ description: 'Opaque identifier of the visit, not of the person' })
  @IsString()
  @Length(8, 64)
  sessionId!: string;

  @ApiProperty({ example: '/es' })
  @IsString()
  @Length(1, 512)
  path!: string;

  @ApiPropertyOptional({
    description: 'site_click only: slug of the group project the click goes to',
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
    description: 'On clicks: area of the page where it happened. Required for click',
    example: 'hero',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  section?: string;

  @ApiPropertyOptional({
    description: 'On clicks: text of the button or link. Required for click',
    example: 'Ver proyectos',
  })
  @IsOptional()
  @IsString()
  @Length(1, 120)
  label?: string;

  @ApiPropertyOptional({
    description: 'Two-letter ISO country, from the header set by the site hosting. Never the IP',
    example: 'BO',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  @ApiPropertyOptional({
    description: 'Only on the first page view of a load: referring domain, without path',
    example: 'www.google.com',
  })
  @IsOptional()
  @Matches(/^[a-z0-9.-]{1,255}$/, { message: 'referrer debe ser un dominio, sin ruta ni esquema' })
  referrer?: string;

  @ApiPropertyOptional({ example: 'instagram' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  utmSource?: string;

  @ApiPropertyOptional({ example: 'social' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  utmMedium?: string;

  @ApiPropertyOptional({ example: 'lanzamiento-otono' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  utmCampaign?: string;

  @ApiPropertyOptional({ description: 'Event instant in ISO 8601. Defaults to the arrival time' })
  @IsOptional()
  @IsISO8601()
  at?: string;
}

export class SiteEventsDto {
  @ApiProperty({ example: 1, description: 'Always 1. If the contract changes, this number changes' })
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
