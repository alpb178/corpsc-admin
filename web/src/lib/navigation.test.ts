import { describe, expect, it } from 'vitest';
import { buildNav, initialsOf, isActive, withRange } from './navigation';

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
      { href: '/projects/corpsc', label: 'CORPSC', icon: 'site', initials: 'CO' },
      { href: '/projects/iris-natural', label: 'Iris Natural', icon: 'site', initials: 'IN' },
    ]);
    expect(tools.items.map((i) => i.label)).toEqual(['Comparar', 'Envíos', 'Configuración']);
  });

  it('shows Configuración only to admins', () => {
    for (const role of ['ANALYST', 'VIEWER'] as const) {
      const labels = buildNav(PROJECTS, role).flatMap((s) => s.items.map((i) => i.label));
      expect(labels).not.toContain('Configuración');
    }
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
