'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  ChevronDown,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
  type LucideIcon,
} from 'lucide-react';
import { logout } from '@/app/(dashboard)/actions';
import { buildNav, isActive, withRange, type NavIcon, type NavProject } from '@/lib/navigation';
import type { HubRole } from '@/lib/types';

const ICONS: Record<Exclude<NavIcon, 'site'>, LucideIcon> = {
  dashboard: LayoutDashboard,
  compare: ArrowLeftRight,
  submissions: Inbox,
  settings: Settings,
};

interface Props {
  projects: NavProject[];
  user: { name: string; email: string; role: HubRole };
  children: ReactNode;
}

/**
 * The panel's drawer layout, the same pattern as Tu Chamba's admin.
 *
 * On desktop the menu is a 64 px rail of icons that expands over the content
 * on hover or keyboard focus, without pushing it. On touch screens, where
 * there's no hover, ☰ pins it open over a dimmed backdrop; on a phone the rail
 * itself is hidden and ☰ is the only way in, so the content keeps the full
 * width. Picking an entry, pressing Escape or tapping outside closes it.
 */
export function AppDrawer({ projects, user, children }: Props) {
  const pathname = usePathname();
  const range = useSearchParams().get('range');
  // Each menu remembers the page it was opened on, so navigating closes it
  // by itself: open means "open here", and another page isn't here.
  const [pinnedOn, setPinnedOn] = useState<string | null>(null);
  const [userMenuOn, setUserMenuOn] = useState<string | null>(null);
  const pinned = pinnedOn === pathname;
  const userMenuOpen = userMenuOn === pathname;
  const setPinned = (open: boolean) => setPinnedOn(open ? pathname : null);
  const setUserMenuOpen = (open: boolean) => setUserMenuOn(open ? pathname : null);
  // Picking an entry closes the menu at once, even with the cursor still over
  // it: hover expansion is off until the mouse leaves.
  const [hoverEnabled, setHoverEnabled] = useState(true);

  const sections = buildNav(projects, user.role);

  useEffect(() => {
    if (!pinned && !userMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinnedOn(null);
      setUserMenuOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned, userMenuOpen]);

  // The labels follow the width: they fade in once it has grown and out at once.
  const label = `whitespace-nowrap transition-opacity duration-200 ease-out ${
    hoverEnabled ? 'group-hover:opacity-100 group-hover:delay-100 group-focus-within:opacity-100 group-focus-within:delay-100' : ''
  } ${pinned ? 'opacity-100' : 'opacity-0'}`;

  return (
    <div className="flex min-h-screen bg-surface">
      {/* The rail's gap in the layout: the real aside is fixed, so expanding
          overlaps the content instead of pushing it. */}
      <div className="hidden w-16 shrink-0 sm:block" aria-hidden="true" />

      <div
        aria-hidden="true"
        onClick={() => setPinned(false)}
        className={`fixed inset-0 z-40 bg-deep/40 transition-opacity duration-300 ${
          pinned ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        id="app-drawer"
        aria-label="Menú principal"
        onMouseLeave={() => setHoverEnabled(true)}
        className={`group fixed inset-y-0 left-0 z-50 flex-col overflow-hidden border-r border-line bg-card transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          hoverEnabled ? 'sm:hover:w-64 sm:hover:shadow-xl sm:focus-within:w-64 sm:focus-within:shadow-xl' : ''
        } ${pinned ? 'flex w-64 shadow-xl' : 'hidden w-16 sm:flex'}`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
          <button
            type="button"
            onClick={() => setPinned(!pinned)}
            aria-label={pinned ? 'Cerrar el menú' : 'Abrir el menú'}
            aria-expanded={pinned}
            aria-controls="app-drawer"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] text-fg-muted hover:bg-elevated hover:text-fg"
          >
            {pinned ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
          <span className={`text-[13px] font-medium text-fg-muted ${label}`}>Menú</span>
        </div>

        <nav aria-label="Secciones" className="flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-3">
          {sections.map((section, i) => (
            <div key={section.title ?? i} className="flex flex-col gap-1">
              {section.title ? (
                <p className={`px-2 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-faint ${label}`}>
                  {section.title}
                </p>
              ) : null}
              {section.items.map((item) => {
                const active = isActive(item.href, pathname);
                const Icon = item.icon === 'site' ? null : ICONS[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={withRange(item.href, range)}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                    onClick={(e) => {
                      // Also closes when picking the page already open, where
                      // the path doesn't change.
                      setPinned(false);
                      setHoverEnabled(false);
                      e.currentTarget.blur();
                    }}
                    className={`flex h-10 items-center gap-3 rounded-[6px] px-2 text-[13px] transition-colors ${
                      active ? 'bg-accent-soft font-semibold text-accent' : 'text-fg-muted hover:bg-elevated hover:text-fg'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {Icon ? (
                        <Icon size={18} aria-hidden />
                      ) : (
                        <span
                          aria-hidden
                          className={`flex h-6 w-6 items-center justify-center rounded-[4px] text-[10px] font-bold ${
                            active ? 'bg-accent text-accent-contrast' : 'bg-elevated text-fg-muted'
                          }`}
                        >
                          {item.initials}
                        </span>
                      )}
                    </span>
                    <span className={label}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          {/* On a phone the rail is hidden: this is the way into the menu. */}
          <button
            type="button"
            onClick={() => setPinned(true)}
            aria-label="Abrir el menú"
            aria-expanded={pinned}
            aria-controls="app-drawer"
            className="flex h-9 w-9 items-center justify-center rounded-[6px] text-fg-muted hover:bg-elevated sm:hidden"
          >
            <Menu size={20} aria-hidden />
          </button>

          <Link href={withRange('/', range)} className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">CORPSC</span>
            <span className="text-[14px] font-semibold text-fg">Hub</span>
          </Link>

          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-[13px] text-fg hover:bg-elevated"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                {user.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden sm:inline">{user.name}</span>
              <ChevronDown size={16} className="text-fg-faint" aria-hidden />
            </button>

            {userMenuOpen ? (
              <>
                <div aria-hidden="true" className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div
                  role="menu"
                  className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-[6px] border border-line bg-card shadow-xl"
                >
                  <div className="border-b border-line px-4 py-3">
                    <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
                    <p className="truncate text-[12px] text-fg-faint">{user.email}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-fg-faint">{user.role.toLowerCase()}</p>
                  </div>
                  <form action={logout}>
                    <button
                      type="submit"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-4 py-3 text-[13px] text-[var(--negative)] hover:bg-elevated"
                    >
                      <LogOut size={16} aria-hidden />
                      Cerrar sesión
                    </button>
                  </form>
                </div>
              </>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  );
}
