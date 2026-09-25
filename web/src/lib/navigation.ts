import type { HubRole } from './types';

/** What the drawer needs of a project: the API's list has more. */
export interface NavProject {
  slug: string;
  name: string;
}

export type NavIcon = 'dashboard' | 'site' | 'compare' | 'submissions' | 'settings';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** For sites: the initials shown on the collapsed rail when there's no logo. */
  initials?: string;
  /** For sites: the site's own logo, from `public/project-icons/`. */
  logo?: string;
}

/**
 * Each site's logo, by slug: the favicon of its own repo, cut to a 96 px
 * square (24 px on a 2× screen, with room for 3×). A project added to the hub
 * without one here shows its initials, so it still appears on its own.
 */
const PROJECT_LOGOS: Record<string, string> = {
  corpsc: '/project-icons/corpsc.png',
  'tu-chamba': '/project-icons/tu-chamba.png',
  'iris-natural': '/project-icons/iris-natural.png',
  take: '/project-icons/take.png',
  invoices: '/project-icons/invoices.png',
};

/** The site's logo, if the panel ships one; the caller shows initials otherwise. */
export function logoOf(slug: string): string | undefined {
  return PROJECT_LOGOS[slug];
}

/** The group's hosts whose subdomain doesn't spell the slug. */
const GROUP_HOSTS: Record<string, string> = {
  'www.corpsc.com': 'corpsc',
  'corpsc.com': 'corpsc',
  'irisnatural.corpsc.com': 'iris-natural',
};

/**
 * Which site of the group a traffic source is, if any: "take.corpsc.com",
 * "www.corpsc.com" or a bare "corpsc" all point back at the group, and the
 * panel can show that site's own logo instead of a letter.
 */
export function groupSiteOf(source: string): string | undefined {
  const host = source.toLowerCase().replace(/^www\./, '');
  if (host in PROJECT_LOGOS) return host;
  if (source.toLowerCase() in GROUP_HOSTS) return GROUP_HOSTS[source.toLowerCase()];
  const sub = /^([a-z0-9-]+)\.corpsc\.com$/.exec(host)?.[1];
  return sub && sub in PROJECT_LOGOS ? sub : undefined;
}

export interface NavSection {
  /** Heading shown only with the drawer expanded. */
  title?: string;
  items: NavItem[];
}

/**
 * The drawer's contents: the group dashboard first, then one entry per site,
 * then the tools.
 *
 * Sites come from the API in the order set in Settings, so adding a project
 * to the hub adds it here without touching the panel. Settings only for
 * ADMIN: someone who can't change anything isn't shown the door. That's
 * courtesy, not security: every settings page and action checks the role.
 */
export function buildNav(projects: NavProject[], role: HubRole): NavSection[] {
  const sections: NavSection[] = [
    { items: [{ href: '/', label: 'Dashboard', icon: 'dashboard' }] },
  ];

  if (projects.length > 0) {
    sections.push({
      title: 'Proyectos',
      items: projects.map((p) => ({
        href: `/projects/${p.slug}`,
        label: p.name,
        icon: 'site' as const,
        initials: initialsOf(p.name),
        ...(PROJECT_LOGOS[p.slug] ? { logo: PROJECT_LOGOS[p.slug] } : {}),
      })),
    });
  }

  const tools: NavItem[] = [
    { href: '/compare', label: 'Comparar', icon: 'compare' },
    { href: '/submissions', label: 'Envíos', icon: 'submissions' },
  ];
  if (role === 'ADMIN') tools.push({ href: '/settings/projects', label: 'Configuración', icon: 'settings' });
  sections.push({ title: 'Herramientas', items: tools });

  return sections;
}

/**
 * Whether an entry is the current page. The dashboard only on `/` itself —
 * every path starts with `/`—; the rest also on their subpages, so
 * Configuración stays lit on /settings/users.
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  const root = href.startsWith('/settings') ? '/settings' : href;
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * Keeps the date range when moving between views: going from the dashboard
 * to a site should show the same period, not jump back to the default.
 */
export function withRange(href: string, range: string | null): string {
  return range ? `${href}?range=${encodeURIComponent(range)}` : href;
}

/** "Iris Natural" → "IN", "CORPSC" → "CO", "tu-chamba" → "TC". */
export function initialsOf(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}
