'use client';

import { useEffect } from 'react';
import { useToast } from '@/components/Toast';

/** Explains, in a toast, why `requireUser()` sent someone here who thought they were still logged in. */
export function SessionExpiredToast() {
  const { show } = useToast();

  useEffect(() => {
    show('Tu sesión ha expirado. Inicia sesión de nuevo.', 'error');
  }, [show]);

  return null;
}
