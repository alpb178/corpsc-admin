/** Shapes returned by the hub API. Mirror of the DTOs in `api/src/metrics`. */

export type MetricTotals = Record<string, number>;

export interface Delta {
  current: number;
  previous: number;
  /** Fraction: 0.12 is +12%. `null` when the previous period was 0. */
  change: number | null;
  /** `null` when there's no change or it can't be judged. */
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
  /** The site against its own previous period. Only with `compare=true`. */
  comparison?: { deltas: Record<string, Delta> };
}

/** Unique, new and returning visitors: counted at read time, never summed per day. */
export interface VisitorStats {
  unique: number;
  new: number;
  returning: number;
  daily: Array<{ date: string; value: number | null }>;
  /** First day with identified (v2) visitors, or null if none yet. */
  since: string | null;
}

export interface ProjectSeries {
  slug: string;
  name: string;
  points: Array<{ date: string; value: number | null }>;
}

export interface TopPage {
  project: { slug: string; name: string };
  path: string;
  pageViews: number;
}

export interface Overview {
  range: Range;
  totals: MetricTotals;
  split: { own: MetricTotals; client: MetricTotals };
  series: SeriesPoint[];
  /** Visits per day of each site. */
  seriesByProject: ProjectSeries[];
  projects: ProjectSummary[];
  visitors: VisitorStats;
  counts: { activeProjects: number; countries: number; sources: number };
  breakdowns: {
    country: DimensionSlice[];
    channel: DimensionSlice[];
    source: DimensionSlice[];
    device: DimensionSlice[];
    /** Custom events, with `custom_events` (and `conversions` where they are goals). */
    event: DimensionSlice[];
  };
  topPages: TopPage[];
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
  visitors: VisitorStats;
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
    /** ISO 3166-2, "BO-L". */
    region: DimensionSlice[];
    /** "La Paz, BO". */
    city: DimensionSlice[];
    browser: DimensionSlice[];
    os: DimensionSlice[];
    /** Two-letter language code. */
    language: DimensionSlice[];
    /** Viewport bucket: xs … xxl. */
    screen: DimensionSlice[];
    /** First page of each visit. */
    landing: DimensionSlice[];
    /** Last page of each visit. */
    exit: DimensionSlice[];
    /** "channel | source | landing". */
    acquisition: DimensionSlice[];
    /** Custom events with `custom_events` and, for goals, `conversions`. */
    event: DimensionSlice[];
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

/* ── Settings ─────────────────────────────────────────────────────────
   Mirror of `api/src/projects`, `api/src/credentials` and `api/src/auth`.
   None of these shapes include a credential's secret: the API never returns
   it except at the moment it is created. */

export type HubRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

export interface AdminProject {
  id: string;
  slug: string;
  name: string;
  domain: string;
  kind: 'OWN' | 'CLIENT';
  timezone: string;
  /** May be unset: some sites don't bill. */
  currency: string | null;
  active: boolean;
  sortOrder: number;
  lastPushAt: string | null;
  /** Having a key assigned is what allows a project to send. */
  credentialId: string | null;
}

export interface CredentialSummary {
  id: string;
  kind: string;
  label: string;
  /** Fingerprint to recognise it by; it can't be used to rebuild the key. */
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

/* ── Real time ── Mirror of `api/src/metrics/realtime.service.ts`. */

export interface RecentEvent {
  at: string;
  project: { slug: string; name: string };
  type: 'page_view' | 'click' | 'site_click' | 'custom';
  path: string;
  country: string | null;
  city: string | null;
  device: string | null;
  /** Page views only: campaign source or referring domain. */
  source: string | null;
  /** Clicks: what was clicked. Custom events: their name. */
  detail: string | null;
}

export interface RealtimeSnapshot {
  minutes: number;
  activeVisitors: number;
  byProject: Array<{ slug: string; name: string; activeVisitors: number }>;
  recent: RecentEvent[];
  lastEventAt: string | null;
}
