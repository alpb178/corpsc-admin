import 'server-only';
import { getToken } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Nest's error body, which is sometimes a list of validation failures. */
async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
  return new ApiError(response.status, message ?? `La API respondió ${response.status}`);
}

/**
 * Calls the hub API with the session token.
 *
 * Always on the server: the token lives in an httpOnly cookie the browser
 * can't read, and it stays that way.
 */
export async function api<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const token = await getToken();
  const url = new URL(`${process.env.API_URL}${path}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    // Analytics data changes once a day, but the date range is chosen by the
    // viewer: caching here would serve stale figures without warning.
    cache: 'no-store',
  });

  if (!response.ok) throw await toApiError(response);

  return (await response.json()) as T;
}

/**
 * Writes to the API with the session token.
 *
 * Only Settings Server Actions call it, and they all check the role before
 * getting here. The API guard has the last word, but not the only one: without
 * the earlier check, a non-admin would be shown a 403 instead of simply not
 * being offered the button.
 */
export async function apiWrite<T>(
  path: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const token = await getToken();

  const response = await fetch(`${process.env.API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}
