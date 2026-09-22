import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Solo experiencia de usuario: si no hay cookie, al login; si la hay y se pide
 * el login, al panel. Nada más.
 *
 * La verificación de verdad —que el token sea válido y el usuario siga
 * activo— está en `lib/dal.ts` y se ejecuta en cada página. Aquí solo se mira
 * si la cookie EXISTE, que es barato y no requiere hablar con la API; dar por
 * buena una sesión por tener una cookie sería confiar en el cliente.
 */
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/login';

  if (!hasCookie && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // Para volver a donde se iba después de entrar.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (hasCookie && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // `api/ingest` queda fuera: la usan los sitios, sin sesión, y la reenvía a la
  // API un rewrite de next.config.ts.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/ingest|.*\\.svg$).*)'],
};
