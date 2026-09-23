import type { NextConfig } from 'next';

/**
 * Panel routes before they were renamed to English. Bookmarks and links
 * already shared keep working; query strings (`?range=`, `?sites=`) pass
 * through untouched.
 *
 * `redirects()` runs BEFORE `proxy.ts`, so an old path is rewritten to its new
 * one even without a session, and the proxy then sends the logged-out user to
 * `/login?next=<new path>`.
 */
const LEGACY_ROUTES: Array<[source: string, destination: string]> = [
  ['/ajustes', '/settings'],
  ['/ajustes/proyectos', '/settings/projects'],
  ['/ajustes/usuarios', '/settings/users'],
  ['/comparar', '/compare'],
  ['/envios', '/submissions'],
  ['/proyectos/:slug', '/projects/:slug'],
];

const nextConfig: NextConfig = {
  // The panel serves no external images and needs nothing special: the less
  // configuration, the less to review when something breaks.
  reactStrictMode: true,

  async redirects() {
    return LEGACY_ROUTES.map(([source, destination]) => ({ source, destination, permanent: true }));
  },

  // The group's sites send to `https://hub.corpsc.com/api/ingest/...`, but the
  // API lives on Render. This rewrite makes that URL the right one, so changing
  // hosting doesn't force touching every site's HUB_URL.
  //
  // Only ingestion: it's the only thing called from outside. The panel talks to
  // the rest of the API server-side, with API_URL. It has to be excluded in
  // `proxy.ts`, which runs before rewrites and would send it to the login.
  async rewrites() {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) return [];
    return [{ source: '/api/ingest/:path*', destination: `${apiUrl}/ingest/:path*` }];
  },
};

export default nextConfig;
