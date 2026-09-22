import Link from 'next/link';
import { requireUser } from '@/lib/dal';
import { logout } from './actions';

const NAV = [
  { href: '/', label: 'Resumen' },
  { href: '/comparar', label: 'Comparar' },
  { href: '/envios', label: 'Envíos' },
];

/** Ajustes solo para ADMIN: a quien no puede tocar nada no se le enseña la
 *  puerta. La protección de verdad está en `requireRole` de cada página y de
 *  cada acción; esto es para no ofrecer un enlace que acabaría en el resumen. */
const NAV_ADMIN = { href: '/ajustes/proyectos', label: 'Ajustes' };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // La comprobación de sesión vive aquí y en cada acción, no en el proxy.
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-6 px-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">CORPSC</span>
            <span className="text-[14px] font-semibold text-fg">Hub</span>
          </Link>

          <nav className="flex items-center gap-1" aria-label="Secciones">
            {(user.role === 'ADMIN' ? [...NAV, NAV_ADMIN] : NAV).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[6px] px-2.5 py-1.5 text-[13px] text-fg-muted hover:bg-elevated hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[12px] text-fg-faint sm:inline">
              {user.name} · {user.role.toLowerCase()}
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded-full border border-line px-3 py-1.5 text-[12px] text-fg-muted hover:text-fg"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-6">{children}</main>
    </div>
  );
}
