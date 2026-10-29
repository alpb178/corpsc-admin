'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { resetPassword, type ActionState } from '../actions';
import { useToast } from '@/components/Toast';

/**
 * An admin sets a new password for someone else, inline in their row.
 *
 * No toast hook shared with the rest of the app here: a reset should also
 * collapse the form back to its button on success, which `useActionToast`
 * doesn't do, so the toast is driven directly off `state`.
 */
export function ResetPasswordForm({ userId, userName }: { userId: string; userName: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(resetPassword, {});
  const { show } = useToast();

  // Closing the form is part of rendering this particular result, not a
  // side effect to sync afterwards — the lint for the React Compiler forbids
  // setState from inside an effect, so this follows React's own pattern for
  // adjusting state when something upstream changed.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }

  useEffect(() => {
    if (state.error) show(state.error, 'error');
    else if (state.ok) show(state.ok, 'success');
  }, [state, show]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-medium text-accent hover:underline"
      >
        Restablecer contraseña
      </button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <label className="sr-only" htmlFor={`${id}-password`}>
        Nueva contraseña para {userName}
      </label>
      <input
        id={`${id}-password`}
        name="password"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        placeholder="Nueva contraseña"
        autoFocus
        className="w-[160px] rounded-[6px] border border-line bg-surface px-2 py-1 text-[12px] text-fg outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-accent-contrast disabled:opacity-60"
      >
        {pending ? '…' : 'Guardar'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Cancelar"
        className="shrink-0 text-fg-faint hover:text-fg"
      >
        ×
      </button>
    </form>
  );
}
