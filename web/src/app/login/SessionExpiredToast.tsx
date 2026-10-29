'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/Toast';

/** Explains, in a toast, why `requireUser()` sent someone here who thought they were still logged in. */
export function SessionExpiredToast() {
  const { show } = useToast();
  // Strict Mode mounts this effect twice in dev; a ref (unlike a module-level
  // flag) still resets if the login page is ever left and landed on again.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    show('Tu sesión ha expirado. Inicia sesión de nuevo.', 'error');
    // Best effort: a failed clear just means the same dead cookie gets
    // rejected again on the next page, not a login that silently fails.
    void fetch('/api/session', { method: 'DELETE' }).catch(() => {});
  }, [show]);

  return null;
}
