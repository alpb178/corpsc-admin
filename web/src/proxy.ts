import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * User experience only: no cookie, off to the login; a cookie and a request
 * for the login, off to the panel. Nothing more.
 *
 * The real check —that the token is valid and the user is still active— lives
 * in `lib/dal.ts` and runs on every page. Here we only look at whether the
 * cookie EXISTS, which is cheap and doesn't require talking to the API;
 * accepting a session just because a cookie is there would mean trusting the
 * client.
 */
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/login';

  if (!hasCookie && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // So we can go back to where the user was heading after signing in.
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
  // `api/ingest` is left out: the sites use it, without a session, and a
  // rewrite in next.config.ts forwards it to the API. The icons, the brand
  // mark and the sites' logos too: static files, and the login page shows the
  // mark before there's a session.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|project-icons/|api/ingest|.*\\.svg$).*)'],
};
