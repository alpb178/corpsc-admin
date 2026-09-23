/** Formato de cifras del panel. Todo en es-BO: el equipo está en Bolivia. */

const LOCALE = 'es-BO';

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedPercent = new Intl.NumberFormat(LOCALE, {
  style: 'percent',
  signDisplay: 'exceptZero',
  maximumFractionDigits: 1,
});

export type Unit = 'COUNT' | 'SECONDS' | 'RATIO' | 'CURRENCY' | 'POSITION';

export function formatMetric(value: number | undefined, unit: Unit = 'COUNT'): string {
  if (value === undefined || Number.isNaN(value)) return '—';

  switch (unit) {
    case 'RATIO':
      return percent.format(value);
    case 'POSITION':
      return oneDecimal.format(value);
    case 'SECONDS':
      return formatDuration(value);
    default:
      return integer.format(value);
  }
}

/** Cifra compacta para los ejes: 12.400 → 12,4 k */
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

/** `null` significa "no se puede calcular", no 0 — y se dice, no se disimula. */
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

/** Las etiquetas reservadas de la ingesta y las que Google devuelve en inglés. */
const RESERVED: Record<string, string> = {
  __other__: 'Resto',
  __unknown__: 'Desconocido',
  __direct__: 'Directo',
  __anonymous__: 'Consultas anonimizadas',
  __total__: 'Total',
  '(not set)': 'Sin definir',
  '(none)': 'Ninguno',
};

/** Categorías de dispositivo habituales. */
const DEVICES: Record<string, string> = {
  mobile: 'Móvil',
  desktop: 'Escritorio',
  tablet: 'Tableta',
  smart_tv: 'Smart TV',
};

/** Grupos de canal habituales. Los que no estén se muestran tal cual. */
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

  // Los proyectos envían el país como código ISO de dos letras. El navegador
  // ya sabe traducirlo, así que no hay tabla de países que mantener.
  if (/^[A-Z]{2}$/.test(value) && regionNames) {
    try {
      const name = regionNames.of(value);
      if (name && name !== value) return name;
    } catch {
      // Código inexistente: se muestra tal cual.
    }
  }

  return value;
}
