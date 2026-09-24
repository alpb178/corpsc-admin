/**
 * What the API exposes depends on where it runs. Development conveniences
 * —Swagger at /docs, any localhost allowed by CORS— are opt-in with
 * NODE_ENV=development, never opt-out: a production deploy that forgets to set
 * NODE_ENV stays closed instead of publishing the whole API surface.
 */
export function isDevelopment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'development';
}

const DEFAULT_ORIGINS = ['https://hub.corpsc.com'];

/** hub.corpsc.com plus CORS_ORIGINS. Only the origin (scheme + host), without path or trailing slash. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ORIGINS, ...fromEnv])];
}

export function isAllowedOrigin(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // No origin means a server-to-server call or curl: CORS doesn't apply.
  if (!origin) return true;
  if (allowedOrigins(env).includes(origin)) return true;
  return isDevelopment(env) && /^http:\/\/localhost:\d+$/.test(origin);
}
