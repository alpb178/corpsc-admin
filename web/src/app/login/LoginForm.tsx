'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="card p-5">
      <input type="hidden" name="next" value={next} />

      <label className="block text-[13px] font-medium text-fg-muted" htmlFor="email">
        Correo
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="mt-1.5 w-full rounded-[6px] border border-line bg-surface px-3 py-2 text-[14px] text-fg outline-none focus:border-accent"
      />

      <label className="mt-4 block text-[13px] font-medium text-fg-muted" htmlFor="password">
        Contraseña
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="mt-1.5 w-full rounded-[6px] border border-line bg-surface px-3 py-2 text-[14px] text-fg outline-none focus:border-accent"
      />

      {state.error ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--negative)]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-accent px-4 py-2.5 text-[14px] font-semibold text-accent-contrast transition-opacity disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
