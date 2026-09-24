import { NextResponse } from 'next/server';
import { getUser } from '@/lib/dal';
import { api, ApiError } from '@/lib/api';
import type { RealtimeSnapshot } from '@/lib/types';

/**
 * The real-time widget polls here every few seconds.
 *
 * It's a route of the panel and not a call to the API from the browser
 * because the session token lives in an httpOnly cookie the page can't read:
 * only the panel's server can forward it. The session is checked here, not
 * only in the proxy, which is an experience layer.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await getUser())) return NextResponse.json({ message: 'Sin sesión' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const project = params.get('project') ?? undefined;
  const minutes = params.get('minutes') ?? undefined;

  try {
    const snapshot = await api<RealtimeSnapshot>('/metrics/realtime', { project, minutes });
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Error' }, { status });
  }
}
