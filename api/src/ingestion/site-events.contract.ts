import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
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
 * agent, no full referring URL. Country, region and city arrive already
 * resolved by the site's hosting; device, browser and OS as coarse families
 * the site's server parsed; of the origin only the domain and the `utm_*`
 * parameters. Session and visitor are opaque identifiers issued by the site
 * itself: the first keeps five pages from counting as five visits, the second
 * tells a returning browser from a new one.
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

/**
 * Versions the hub understands. 2 adds the event id, the visitor, the device,
 * finer location and custom events, all optional: a v1 sender keeps working,
 * and a site can move to v2 without the hub having to be deployed with it.
 */
export const SITE_EVENTS_SCHEMA_VERSIONS = [1, 2] as const;

export const SITE_EVENT_KINDS = ['page_view', 'site_click', 'click', 'custom'] as const;
export type SiteEventKind = (typeof SITE_EVENT_KINDS)[number];
export type LinkType = 'web' | 'android' | 'ios';

export const DEVICES = ['mobile', 'tablet', 'desktop'] as const;

/**
 * Viewport width buckets, so the screen says something useful without
 * becoming a fingerprint: xs < 576 ≤ sm < 768 ≤ md < 992 ≤ lg < 1200 ≤ xl
 * < 1440 ≤ xxl.
 */
export const SCREENS = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const;

/** Same shape as a metric key: it ends up as a dimension value in the panel. */
export const EVENT_NAME = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Limits of a custom event's properties. They're for segmenting (`plan`,
 * `step`, `product_type`), not for carrying data: a flat object, a handful of
 * keys, short primitive values, and a hard size cap so nobody ends up sending
 * a form's contents.
 */
export const MAX_PROPS = 10;
export const MAX_PROPS_BYTES = 1024;
export const MAX_PROP_TEXT = 100;
const PROP_KEY = /^[a-z][a-z0-9_]{0,31}$/;

/** Why the properties are rejected, or `null` if they're acceptable. */
export function propsProblem(props: unknown): string | null {
  if (typeof props !== 'object' || props === null || Array.isArray(props)) {
    return '`props` debe ser un objeto plano';
  }
  const entries = Object.entries(props);
  if (entries.length > MAX_PROPS) return `\`props\` admite como mucho ${MAX_PROPS} claves`;

  for (const [key, value] of entries) {
    if (!PROP_KEY.test(key)) return `Clave de \`props\` no válida: "${key}" (snake_case, hasta 32)`;
    const ok =
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= MAX_PROP_TEXT);
    if (!ok) {
      return `\`props.${key}\` debe ser texto de hasta ${MAX_PROP_TEXT} caracteres, número o booleano`;
    }
  }

  if (Buffer.byteLength(JSON.stringify(props)) > MAX_PROPS_BYTES) {
    return `\`props\` no puede pasar de ${MAX_PROPS_BYTES} bytes`;
  }
  return null;
}

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

  // ─────────────── v2 ───────────────

  @ApiPropertyOptional({
    description: 'v2: UUID issued by the browser. A beacon sent twice is stored once',
    example: '0b6f1c1e-3d4a-4c8e-9a52-7a1f0e2b9c11',
  })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({
    description: 'v2: opaque identifier of the browser, issued by the site server. Not of a person',
  })
  @IsOptional()
  @IsString()
  @Length(8, 64)
  visitorId?: string;

  @ApiPropertyOptional({ description: 'custom only, and required there: snake_case name', example: 'contact_submit' })
  @IsOptional()
  @Matches(EVENT_NAME, { message: 'name debe ser snake_case, empezar por letra y tener 2-64 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    description: `custom only: flat object, up to ${MAX_PROPS} keys and ${MAX_PROPS_BYTES} bytes, primitive values`,
    example: { plan: 'pro' },
  })
  @IsOptional()
  @IsObject()
  props?: Record<string, string | number | boolean>;

  @ApiPropertyOptional({ description: 'v2: region code from the site hosting (ISO 3166-2 suffix)', example: 'L' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{1,8}$/)
  region?: string;

  @ApiPropertyOptional({ description: 'v2: city from the site hosting', example: 'La Paz' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiPropertyOptional({ enum: DEVICES })
  @IsOptional()
  @IsIn(DEVICES)
  device?: string;

  @ApiPropertyOptional({ description: 'v2: browser family, never the user agent', example: 'Chrome' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  browser?: string;

  @ApiPropertyOptional({ description: 'v2: operating system family', example: 'Android' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  os?: string;

  @ApiPropertyOptional({ description: 'v2: primary browser language, two letters', example: 'es' })
  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  language?: string;

  @ApiPropertyOptional({ enum: SCREENS, description: 'v2: viewport width bucket' })
  @IsOptional()
  @IsIn(SCREENS)
  screen?: string;
}

export class SiteEventsDto {
  @ApiProperty({ enum: SITE_EVENTS_SCHEMA_VERSIONS, description: 'If the contract changes, this number changes' })
  @IsIn(SITE_EVENTS_SCHEMA_VERSIONS)
  schemaVersion!: number;

  @ApiProperty({ type: [SiteEventDto], maxItems: MAX_EVENTS_PER_REQUEST })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_EVENTS_PER_REQUEST)
  @ValidateNested({ each: true })
  @Type(() => SiteEventDto)
  events!: SiteEventDto[];
}
