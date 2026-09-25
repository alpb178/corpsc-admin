import { describe, expect, it } from 'vitest';
import { groupSiteOf, buildNav, initialsOf, isActive, withRange } from './navigation';

const PROJECTS = [
  { slug: 'corpsc', name: 'CORPSC' },
  { slug: 'iris-natural', name: 'Iris Natural' },
];

describe('buildNav', () => {
  it('puts the dashboard first, then one entry per site, then the tools', () => {
    const [first, sites, tools] = buildNav(PROJECTS, 'ADMIN');

    expect(first.items).toEqual([{ href: '/', label: 'Dashboard', icon: 'dashboard' }]);
    expect(sites.title).toBe('Proyectos');
    expect(sites.items).toEqual([
      { href: '/projects/corpsc', label: 'CORPSC', icon: 'site', initials: 'CO', logo: '/project-icons/corpsc.png' },
      {
        href: '/projects/iris-natural',
        label: 'Iris Natural',
        icon: 'site',
        initials: 'IN',
        logo: '/project-icons/iris-natural.png',
      },
    ]);
    expect(tools.items.map((i) => i.label)).toEqual(['Comparar', 'Envíos', 'Configuración']);
  });

  it('shows Configuración only to admins', () => {
    for (const role of ['ANALYST', 'VIEWER'] as const) {
      const labels = buildNav(PROJECTS, role).flatMap((s) => s.items.map((i) => i.label));
      expect(labels).not.toContain('Configuración');
    }
  });

  it('gives every current site its logo', () => {
    const slugs = ['corpsc', 'tu-chamba', 'iris-natural', 'take', 'invoices'];
    const [, sites] = buildNav(slugs.map((slug) => ({ slug, name: slug })), 'VIEWER');
    expect(sites.items.map((i) => i.logo)).toEqual(slugs.map((slug) => `/project-icons/${slug}.png`));
  });

  it('falls back to initials for a project added without a logo', () => {
    const [, sites] = buildNav([{ slug: 'nuevo-sitio', name: 'Nuevo Sitio' }], 'VIEWER');
    expect(sites.items[0]).toEqual({ href: '/projects/nuevo-sitio', label: 'Nuevo Sitio', icon: 'site', initials: 'NS' });
  });

  it('leaves out the sites section when there are none', () => {
    expect(buildNav([], 'VIEWER').map((s) => s.title)).toEqual([undefined, 'Herramientas']);
  });
});

describe('isActive', () => {
  it('lights the dashboard only on its own path', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/', '/compare')).toBe(false);
  });

  it('lights an entry on its subpages, but not on a path that merely starts alike', () => {
    expect(isActive('/projects/take', '/projects/take')).toBe(true);
    expect(isActive('/projects/take', '/projects/take-2')).toBe(false);
    expect(isActive('/settings/projects', '/settings/users')).toBe(true);
    expect(isActive('/compare', '/submissions')).toBe(false);
  });
});

describe('withRange', () => {
  it('keeps the date range between views', () => {
    expect(withRange('/projects/take', '7d')).toBe('/projects/take?range=7d');
    expect(withRange('/', null)).toBe('/');
  });
});

describe('initialsOf', () => {
  it.each([
    ['Iris Natural', 'IN'],
    ['CORPSC', 'CO'],
    ['Tu Chamba', 'TC'],
    ['tu-chamba', 'TC'],
    ['Take', 'TA'],
  ])('%s → %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});

describe('groupSiteOf', () => {
  it('recognises the group\'s own hosts and slugs, and nothing else', () => {
    expect(groupSiteOf('take.corpsc.com')).toBe('take');
    expect(groupSiteOf('www.corpsc.com')).toBe('corpsc');
    expect(groupSiteOf('corpsc.com')).toBe('corpsc');
    expect(groupSiteOf('irisnatural.corpsc.com')).toBe('iris-natural');
    expect(groupSiteOf('tu-chamba')).toBe('tu-chamba');
    expect(groupSiteOf('google.com')).toBeUndefined();
    expect(groupSiteOf('evil.corpsc.com')).toBeUndefined();
  });
});
