/** Formas que devuelve la API del hub. Espejo de los DTO de `api/src/metrics`. */

export type MetricTotals = Record<string, number>;

export interface Delta {
  current: number;
  previous: number;
  /** Fracción: 0.12 es +12%. `null` cuando el periodo anterior era 0. */
  change: number | null;
  /** `null` cuando no hay variación o no se puede juzgar. */
  improved: boolean | null;
}

export interface Range {
  from: string;
  to: string;
}

export interface Comparison {
  range: Range;
  deltas: Record<string, Delta>;
}

export interface ProjectSummary {
  slug: string;
  name: string;
  kind: 'OWN' | 'CLIENT';
  domain: string;
  metrics: MetricTotals;
}

export interface Overview {
  range: Range;
  totals: MetricTotals;
  split: { own: MetricTotals; client: MetricTotals };
  series: SeriesPoint[];
  projects: ProjectSummary[];
  comparison?: Comparison;
}

export interface DimensionSlice {
  value: string;
  metrics: MetricTotals;
}

export interface SeriesPoint {
  date: string;
  metrics: MetricTotals;
}

export interface ProjectDetail {
  project: {
    slug: string;
    name: string;
    domain: string;
    kind: 'OWN' | 'CLIENT';
    timezone: string;
    lastPushAt: string | null;
    freshness: Freshness;
    hoursSince: number | null;
  };
  range: Range;
  totals: MetricTotals;
  series: SeriesPoint[];
  breakdowns: {
    country: DimensionSlice[];
    device: DimensionSlice[];
    /** Pages, with both `page_views` and `clicks`. */
    path: DimensionSlice[];
    /** Where people clicked: "path | section | label", ranked by `clicks`. */
    element: DimensionSlice[];
    channel: DimensionSlice[];
    source: DimensionSlice[];
    campaign: DimensionSlice[];
    /** "00"–"23" in the project's time zone, with `visits` and `page_views`. */
    hour: DimensionSlice[];
  };
  comparison?: Comparison;
}

export type Freshness = 'OK' | 'LATE' | 'STALE' | 'NEVER';

export interface ProjectFreshness {
  slug: string;
  name: string;
  lastPushAt: string | null;
  hoursSince: number | null;
  freshness: Freshness;
}

export interface CompareView {
  range: Range;
  metric: { key: string; label: string; unit: string };
  series: Array<{ slug: string; name: string; points: Array<{ date: string; value: number }> }>;
}

export interface MetricDefinition {
  key: string;
  label: string;
  unit: 'COUNT' | 'SECONDS' | 'RATIO' | 'CURRENCY' | 'POSITION';
  derivedFrom: { numerator: string; denominator: string } | null;
}

/* ── Ajustes ──────────────────────────────────────────────────────────
   Espejo de `api/src/projects`, `api/src/credentials` y `api/src/auth`.
   Ninguna de estas formas incluye el secreto de una credencial: la API no lo
   devuelve nunca salvo en el instante de crearla. */

export type HubRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface AdminProject {
  id: string;
  slug: string;
  name: string;
  domain: string;
  kind: 'OWN' | 'CLIENT';
  timezone: string;
  /** Puede no estar puesta: hay sitios que no facturan. */
  currency: string | null;
  active: boolean;
  sortOrder: number;
  lastPushAt: string | null;
  /** Tener clave asignada es lo que habilita a un proyecto a enviar. */
  credentialId: string | null;
}

export interface CredentialSummary {
  id: string;
  kind: string;
  label: string;
  /** Huella para reconocerla; no sirve para reconstruir la clave. */
  fingerprint: string;
  createdAt: string;
  projects: Array<{ slug: string; name: string }>;
}

export interface HubUserRow {
  id: string;
  email: string;
  name: string;
  role: HubRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
