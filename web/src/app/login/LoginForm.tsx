'use client';

import { useActionState, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { login, type LoginState } from './actions';
import { useActionToast } from '@/components/Toast';

const INPUT_CLASS =
  'mt-1.5 w-full rounded-[6px] border border-line bg-surface px-3 py-2 text-[14px] text-fg outline-none transition-shadow focus:border-accent focus:ring-[3px] focus:ring-accent-soft';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [showPassword, setShowPassword] = useState(false);
  useActionToast(state);

  return (
    <form action={action} className="card p-6">
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
        className={INPUT_CLASS}
      />

      <label className="mt-4 block text-[13px] font-medium text-fg-muted" htmlFor="password">
        Contraseña
      </label>
      <div className="relative">
        <input
          id="password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          required
          className={`${INPUT_CLASS} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={showPassword}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-fg-faint transition-colors hover:text-fg"
        >
          {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 text-[13px] text-[var(--negative)]">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-full bg-accent px-4 py-2.5 text-[14px] font-semibold text-accent-contrast transition-colors hover:bg-accent-strong disabled:opacity-60 disabled:hover:bg-accent"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
