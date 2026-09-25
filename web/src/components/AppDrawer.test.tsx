import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDrawer } from './AppDrawer';
import type { HubRole } from '@/lib/types';

const nav = vi.hoisted(() => ({ pathname: '/', search: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));
vi.mock('@/app/(dashboard)/actions', () => ({ logout: vi.fn() }));

const PROJECTS = [
  { slug: 'corpsc', name: 'CORPSC' },
  { slug: 'tu-chamba', name: 'Tu Chamba' },
];
const ADMIN: { name: string; email: string; role: HubRole } = { name: 'Ana Pérez', email: 'ana@corpsc.com', role: 'ADMIN' };

function renderDrawer(user = ADMIN) {
  return render(
    <AppDrawer projects={PROJECTS} user={user}>
      <p>contenido</p>
    </AppDrawer>,
  );
}

const menu = () => screen.getByRole('complementary', { name: 'Menú principal' });
const railToggle = () => within(menu()).getByRole('button');

beforeEach(() => {
  nav.pathname = '/';
  nav.search = new URLSearchParams();
});

describe('AppDrawer', () => {
  it('lists the dashboard, every site and the tools, and renders the page', () => {
    renderDrawer();

    const links = within(menu()).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/', '/projects/corpsc', '/projects/tu-chamba', '/compare', '/submissions', '/records', '/settings/projects']);
    expect(screen.getByText('contenido')).toBeTruthy();
  });

  it("shows each site's logo, and initials for one without", () => {
    render(
      <AppDrawer projects={[...PROJECTS, { slug: 'nuevo-sitio', name: 'Nuevo Sitio' }]} user={ADMIN}>
        <p>contenido</p>
      </AppDrawer>,
    );

    const logo = within(menu()).getByTitle('CORPSC').querySelector('img');
    expect(logo?.getAttribute('src')).toContain('project-icons%2Fcorpsc.png');
    // Decorative: the link's label already names the site.
    expect(logo?.getAttribute('alt')).toBe('');
    const fresh = within(menu()).getByTitle('Nuevo Sitio');
    expect(fresh.querySelector('img')).toBeNull();
    expect(within(fresh).getByText('NS')).toBeTruthy();
  });

  it('marks the current page', () => {
    nav.pathname = '/projects/tu-chamba';
    renderDrawer();

    const current = within(menu()).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.getAttribute('title'))).toEqual(['Tu Chamba']);
  });

  it('keeps the date range in every link', () => {
    nav.search = new URLSearchParams('range=7d');
    renderDrawer();

    expect(within(menu()).getByTitle('CORPSC').getAttribute('href')).toBe('/projects/corpsc?range=7d');
    expect(screen.getByRole('link', { name: /CORPSC\s*Hub/ }).getAttribute('href')).toBe('/?range=7d');
  });

  it('carries the CORPSC mark next to the name, as decoration', () => {
    renderDrawer();
    const mark = screen.getByRole('link', { name: /CORPSC\s*Hub/ }).querySelector('img');
    expect(mark?.getAttribute('src')).toContain('brand%2Fcorpsc-mark.png');
    expect(mark?.getAttribute('alt')).toBe('');
  });

  it('hides Configuración from someone who only reads', () => {
    renderDrawer({ ...ADMIN, role: 'VIEWER' });
    expect(within(menu()).queryByTitle('Configuración')).toBeNull();
  });

  it('pins open with ☰ and closes with Escape', () => {
    renderDrawer();

    fireEvent.click(railToggle());
    expect(railToggle().getAttribute('aria-expanded')).toBe('true');
    expect(railToggle().getAttribute('aria-label')).toBe('Cerrar el menú');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(railToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens from the header on a phone and closes when an entry is picked', () => {
    renderDrawer();

    const headerToggle = within(screen.getByRole('banner')).getByRole('button', { name: 'Abrir el menú' });
    fireEvent.click(headerToggle);
    expect(railToggle().getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(within(menu()).getByTitle('Comparar'));
    expect(railToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when tapping outside', () => {
    const { container } = renderDrawer();
    fireEvent.click(railToggle());

    const backdrop = container.querySelector('.fixed.inset-0.z-40') as HTMLElement;
    fireEvent.click(backdrop);
    expect(railToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('shows who is signed in and offers to sign out', () => {
    renderDrawer();

    const account = screen.getByRole('button', { name: /Ana Pérez/ });
    expect(account.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(account);

    const popup = screen.getByRole('menu');
    expect(within(popup).getByText('ana@corpsc.com')).toBeTruthy();
    expect(within(popup).getByRole('menuitem', { name: /Cerrar sesión/ })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the account menu when tapping outside it', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: /Ana Pérez/ }));

    const overlay = screen.getByRole('menu').previousElementSibling as HTMLElement;
    fireEvent.click(overlay);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when navigating to another page', () => {
    const { rerender } = renderDrawer();
    fireEvent.click(railToggle());

    nav.pathname = '/compare';
    rerender(
      <AppDrawer projects={PROJECTS} user={ADMIN}>
        <p>contenido</p>
      </AppDrawer>,
    );
    expect(railToggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores keys other than Escape', () => {
    renderDrawer();
    fireEvent.click(railToggle());
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(railToggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('lets hover expand it again once the pointer leaves', () => {
    renderDrawer();
    fireEvent.click(within(menu()).getByTitle('Envíos'));
    expect(menu().className).not.toContain('sm:hover:w-64');

    fireEvent.mouseLeave(menu());
    expect(menu().className).toContain('sm:hover:w-64');
  });
});
