/** Rangos de fechas del panel. */

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
 * Rango a partir de un preset.
 *
 * Termina AYER, no hoy: los proyectos envían de madrugada el día ya cerrado,
 * así que incluir hoy solo añade una caída al final de todas las gráficas que
 * no significa nada.
 */
export function resolveRange(preset: string, now = new Date()): { from: string; to: string } {
  const days = PRESETS.find((p) => p.key === preset)?.days ?? 28;
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: iso(from), to: iso(to) };
}

/** Lee el preset de los searchParams, cayendo al de por defecto si es raro. */
export function presetFrom(params: { range?: string; rango?: string } | undefined): string {
  // `rango` is the pre-rename name: links shared before it still work.
  const value = params?.range ?? params?.rango;
  return PRESETS.some((p) => p.key === value) ? value! : DEFAULT_PRESET;
}
