import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/session';

/**
 * Clears a dead session cookie. `SessionExpiredToast` calls this once it
 * lands on `/login?reason=expired`: a cookie write is only legal in a Server
 * Action or a Route Handler, never from the page/layout that noticed the
 * session had died, so the clear happens here instead of in `requireUser()`.
 */
export async function DELETE(): Promise<NextResponse> {
  await clearSession();
  return new NextResponse(null, { status: 204 });
}
