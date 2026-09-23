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
