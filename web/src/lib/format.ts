/** Number formatting for the panel. Everything in es-BO: the team is in Bolivia. */

const LOCALE = 'es-BO';

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedPercent = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  signDisplay: 'exceptZero',
  maximumFractionDigits: 1,
});

/**
 * How a figure reads. `RATIO` is a rate shown as a percentage (conversion);
 * `AVERAGE` is a mean shown as a plain number with one decimal (pages per
 * visit: 1.8, not 180 %).
 */
export type Unit = 'COUNT' | 'SECONDS' | 'RATIO' | 'AVERAGE' | 'CURRENCY' | 'POSITION';

export function formatMetric(value: number | undefined, unit: Unit = 'COUNT'): string {
  if (value === undefined || Number.isNaN(value)) return '—';

  switch (unit) {
    case 'RATIO':
      return percent.format(value);
    case 'AVERAGE':
    case 'POSITION':
      return oneDecimal.format(value);
    case 'SECONDS':
      return formatDuration(value);
    default:
      return integer.format(value);
  }
}

const share = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });

/** A part of a whole, whole numbers only: 0.404 → "40 %"; under 1 % reads "< 1 %", never "0 %". */
export function formatShare(fraction: number): string {
  if (fraction > 0 && fraction < 0.005) return `< ${share.format(0.01)}`;
  return share.format(fraction);
}

/** Compact figure for the axes: 12.400 → 12,4 k */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${oneDecimal.format(value / 1_000_000)} M`;
  if (Math.abs(value) >= 1_000) return `${oneDecimal.format(value / 1_000)} k`;
  return integer.format(value);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** `null` means "can't be computed", not 0 — and we say so rather than hide it. */
export function formatChange(change: number | null): string {
  return change === null ? 'sin base' : signedPercent.format(change);
}

const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formatDay(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`));
}

export function formatFullDate(iso: string): string {
  return fullDate.format(new Date(`${iso}T00:00:00Z`));
}

/** "2026-09-05" → "5/9": for axes with a column per day, where "5 sept" doesn't fit. */
export function formatShortDay(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(day)}/${Number(month)}`;
}

/** Ingestion's reserved labels and the ones Google returns in English. */
const RESERVED: Record<string, string> = {
  __other__: 'Resto',
  __unknown__: 'Desconocido',
  __direct__: 'Directo',
  __anonymous__: 'Consultas anonimizadas',
  __total__: 'Total',
  '(not set)': 'Sin definir',
  '(none)': 'Ninguno',
};

/** Common device categories. */
const DEVICES: Record<string, string> = {
  mobile: 'Móvil',
  desktop: 'Escritorio',
  tablet: 'Tableta',
  smart_tv: 'Smart TV',
};

/** Common channel groups. Anything not listed is shown as is. */
const CHANNELS: Record<string, string> = {
  'Organic Search': 'Búsqueda orgánica',
  'Paid Search': 'Búsqueda de pago',
  Direct: 'Directo',
  Referral: 'Referencia',
  'Organic Social': 'Redes sociales',
  'Paid Social': 'Redes sociales de pago',
  Email: 'Correo',
  Display: 'Display',
  Affiliates: 'Afiliados',
  'Organic Video': 'Vídeo orgánico',
  'Paid Video': 'Vídeo de pago',
  Unassigned: 'Sin asignar',
  'Cross-network': 'Multired',
};

const regionNames =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames([LOCALE], { type: 'region' })
    : null;

export function labelDimension(value: string): string {
  if (value in RESERVED) return RESERVED[value];
  if (value in DEVICES) return DEVICES[value];
  if (value in CHANNELS) return CHANNELS[value];

  // Projects send the country as a two-letter ISO code. The browser already
  // knows how to translate it, so there's no country table to maintain.
  if (/^[A-Z]{2}$/.test(value) && regionNames) {
    try {
      const name = regionNames.of(value);
      if (name && name !== value) return name;
    } catch {
      // Unknown code: shown as is.
    }
  }

  return value;
}

const languageNames =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames([LOCALE], { type: 'language' })
    : null;

/** `es` → "español". Reserved values and unknown codes as `labelDimension`. */
export function labelLanguage(value: string): string {
  if (value in RESERVED) return RESERVED[value];
  try {
    const name = languageNames?.of(value);
    if (name && name !== value) return name;
  } catch {
    // Not a language code: shown as is.
  }
  return value;
}

/** The viewport buckets of the tracker, in words. */
const SCREENS: Record<string, string> = {
  xs: 'Móvil (< 576 px)',
  sm: 'Móvil grande (576–767 px)',
  md: 'Tableta (768–991 px)',
  lg: 'Portátil (992–1199 px)',
  xl: 'Escritorio (1200–1439 px)',
  xxl: 'Pantalla grande (≥ 1440 px)',
};

export function labelScreen(value: string): string {
  return SCREENS[value] ?? labelDimension(value);
}

/**
 * "BO-L" → "L · Bolivia". The subdivision code alone is ambiguous ("L" is La
 * Paz in Bolivia and Lima in Peru), so its country goes with it.
 */
export function labelRegion(value: string): string {
  const match = /^([A-Z]{2})-(.+)$/.exec(value);
  if (!match) return labelDimension(value);
  return `${match[2]} · ${labelDimension(match[1])}`;
}

const clock = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  // 24 h: es-BO would otherwise write "06:42 p. m.", and the table has no room for it.
  hourCycle: 'h23',
  timeZone: 'America/La_Paz',
});

/** "25 sept, 18:42", in the group's time zone: when a list isn't live, the hour beats "hace 3 h". */
export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

/** "hace 12 s", "hace 3 min", "hace 2 h": how long ago, for the real-time list. */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

const EVENT_TYPES: Record<string, string> = {
  page_view: 'Visita a',
  click: 'Clic en',
  site_click: 'Salida a otro sitio desde',
  custom: 'Evento en',
};

/** How a raw event type reads in the real-time list. */
export function labelEventType(type: string): string {
  return EVENT_TYPES[type] ?? type;
}
