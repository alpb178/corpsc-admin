'use client';

import { useActionState, useId, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { wipeProject } from './actions';
import type { ActionResult } from '@/lib/types';

/**
 * The one button that deletes everything a site sent. The site's name has
 * to be typed, letter for letter, before the button does anything: a click
 * on the wrong card must not be enough to lose a year of data.
 */
export function WipeProjectForm({ slug, name }: { slug: string; name: string }) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const [state, action, pending] = useActionState<ActionResult, FormData>(wipeProject, {});
  const armed = typed.trim() === name;

  return (
    <form action={action} className="card border-negative/40 p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-negative">
        <TriangleAlert size={15} aria-hidden />
        Eliminar todos los registros de {name}
      </h2>
      <p className="mt-1 max-w-[70ch] text-[12px] text-fg-muted">
        Borra todos los eventos, todas las métricas de todos los días, los visitantes y el historial de envíos del sitio.
        El sitio, su clave y sus conversiones se conservan y puede volver a enviar. No se puede deshacer.
      </p>

      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="name" value={name} />

      <label htmlFor={`${id}-confirm`} className="mt-3 block text-[12px] font-medium text-fg-muted">
        Escribe «{name}» para confirmar
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={`${id}-confirm`}
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="w-full max-w-[20rem] rounded-[6px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-negative"
        />
        <button
          type="submit"
          disabled={!armed || pending}
          className="rounded-full bg-negative px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          {pending ? 'Eliminando…' : 'Eliminar todo'}
        </button>
      </div>

      {state.error ? <p role="alert" className="mt-3 text-[12px] text-negative">{state.error}</p> : null}
      {state.ok ? <p role="status" className="mt-3 text-[12px] text-positive">{state.ok}</p> : null}
    </form>
  );
}
