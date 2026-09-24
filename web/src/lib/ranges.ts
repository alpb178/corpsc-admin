/** The panel's date ranges. */

export interface Preset {
  key: string;
  label: string;
  days: number;
}

export const PRESETS: Preset[] = [
  // Live: the beacon sites are rolled up seconds after each visit.
  { key: 'today', label: 'Hoy', days: 1 },
  { key: '7d', label: '7 días', days: 7 },
  { key: '28d', label: '28 días', days: 28 },
  { key: '90d', label: '90 días', days: 90 },
  { key: '12m', label: '12 meses', days: 365 },
];

export const DEFAULT_PRESET = '28d';

/**
 * The group's calendar. Facts are dated in each project's time zone, and every
 * project runs on La Paz time (the schema's default): "today" has to be their
 * today, not UTC's, or from 20:00 on the panel would already be showing
 * tomorrow.
 */
export const GROUP_TIMEZONE = 'America/La_Paz';

const calendarDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: GROUP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date (YYYY-MM-DD) in the group's time zone. */
export function today(now = new Date()): string {
  return calendarDay.format(now);
}

/** `days` days before or after an ISO date, without going through local time. */
export function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The last `days` days, today included. */
export function lastDays(days: number, now = new Date()): { from: string; to: string } {
  const to = today(now);
  return { from: shiftDay(to, -(days - 1)), to };
}

/**
 * Range from a preset.
 *
 * It ends TODAY: the beacon sites are consolidated live, a few seconds after
 * each visit, so the current day is real data, not a gap. Projects that push
 * a daily aggregate only send it once the day closes: for them today stays
 * empty until tomorrow, and the chart shows it as a gap, not as a zero.
 */
export function resolveRange(preset: string, now = new Date()): { from: string; to: string } {
  const days = PRESETS.find((p) => p.key === preset)?.days ?? 28;
  return lastDays(days, now);
}

/** Reads the preset from searchParams, falling back to the default if it's odd. */
export function presetFrom(params: { range?: string; rango?: string } | undefined): string {
  // `rango` is the pre-rename name: links shared before it still work.
  const value = params?.range ?? params?.rango;
  return PRESETS.some((p) => p.key === value) ? value! : DEFAULT_PRESET;
}
