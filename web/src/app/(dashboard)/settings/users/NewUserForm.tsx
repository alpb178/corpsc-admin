'use client';

import { useActionState, useId } from 'react';
import { createUser, type ActionState } from '../actions';

const fieldClass =
  'mt-1 w-full rounded-[6px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent';
const labelClass = 'block text-[12px] font-medium text-fg-muted';

/**
 * User sign-up.
 *
 * The default role is the least privileged one: the panel shows data from
 * client sites, and creating someone as read-only and promoting them later is
 * reversible; the other way round isn't.
 */
export function NewUserForm() {
  const id = useId();
  const [state, action, pending] = useActionState<ActionState, FormData>(createUser, {});

  return (
    <form action={action} className="rounded-[6px] border border-line bg-card p-4">
      <h2 className="text-[13px] font-semibold text-fg">Dar de alta</h2>

      <div className="mt-3 space-y-3">
        <div>
          <label className={labelClass} htmlFor={`${id}-name`}>Nombre</label>
          <input id={`${id}-name`} name="name" required minLength={2} className={fieldClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor={`${id}-email`}>Correo</label>
          <input id={`${id}-email`} name="email" type="email" required className={fieldClass} />
        </div>

        <div>
          <label className={labelClass} htmlFor={`${id}-password`}>Contraseña</label>
          <input
            id={`${id}-password`}
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={fieldClass}
          />
          <p className="mt-1 text-[11px] text-fg-faint">Mínimo 10 caracteres. Se la das tú y que la cambie.</p>
        </div>

        <div>
          <label className={labelClass} htmlFor={`${id}-role`}>Rol</label>
          <select id={`${id}-role`} name="role" defaultValue="VIEWER" className={fieldClass}>
            <option value="VIEWER">Lectura — solo ve el panel</option>
            <option value="ANALYST">Analista — ve el panel</option>
            <option value="ADMIN">Administrador — además, ajustes y claves</option>
          </select>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 text-[12px] text-[var(--negative)]">{state.error}</p>
      ) : null}
      {state.ok ? <p className="mt-3 text-[12px] text-[var(--positive)]">{state.ok}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-contrast disabled:opacity-60"
      >
        {pending ? 'Creando…' : 'Crear usuario'}
      </button>
    </form>
  );
}
