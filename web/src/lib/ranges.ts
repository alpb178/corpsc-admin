/** The panel's date ranges. */

export interface Preset {
  key: string;
  label: string;
  days: number;
}

export const PRESETS: Preset[] = [
  { key: '7d', label: '7 días', days: 7 },
  { key: '28d', label: '28 días', days: 28 },
  { key: '90d', label: '90 días', days: 90 },
  { key: '12m', label: '12 meses', days: 365 },
];

export const DEFAULT_PRESET = '28d';

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Range from a preset.
 *
 * It ends YESTERDAY, not today: projects send the already-closed day in the
 * early hours, so including today only adds a meaningless drop at the end of
 * every chart.
 */
export function resolveRange(preset: string, now = new Date()): { from: string; to: string } {
  const days = PRESETS.find((p) => p.key === preset)?.days ?? 28;
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: iso(from), to: iso(to) };
}

/** Reads the preset from searchParams, falling back to the default if it's odd. */
export function presetFrom(params: { range?: string; rango?: string } | undefined): string {
  // `rango` is the pre-rename name: links shared before it still work.
  const value = params?.range ?? params?.rango;
  return PRESETS.some((p) => p.key === value) ? value! : DEFAULT_PRESET;
}
