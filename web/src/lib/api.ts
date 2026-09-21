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

/** El cuerpo de error de Nest, que a veces es una lista de fallos de validación. */
async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
  return new ApiError(response.status, message ?? `La API respondió ${response.status}`);
}

/**
 * Llama a la API del hub con el token de la sesión.
 *
 * Siempre en el servidor: el token vive en una cookie httpOnly que el
 * navegador no puede leer, y así sigue.
 */
export async function api<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const token = await getToken();
  const url = new URL(`${process.env.API_URL}${path}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    // Los datos de analítica cambian una vez al día, pero el rango de fechas
    // lo elige quien mira: cachear aquí daría cifras viejas sin avisar.
    cache: 'no-store',
  });

  if (!response.ok) throw await toApiError(response);

  return (await response.json()) as T;
}

/**
 * Escribe en la API con el token de la sesión.
 *
 * Solo la llaman Server Actions de Ajustes, y todas comprueban el rol antes de
 * llegar aquí. El guard de la API es la última palabra, pero no la única: sin
 * la comprobación previa, a quien no es administrador se le enseñaría un 403
 * en vez de no ofrecerle el botón.
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
