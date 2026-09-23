'use client';

import { useActionState, useId, useState } from 'react';
import { formatFullDate } from '@/lib/format';
import { assignKey, createKey, revokeKey, updateProject, type ActionState, type KeyState } from '../actions';
import type { AdminProject, CredentialSummary } from '@/lib/types';

/** The group's time zones, as a shortcut. The API accepts any the runtime knows. */
const ZONES = ['America/La_Paz', 'America/Havana', 'America/Bogota', 'Europe/Madrid', 'UTC'];

const fieldClass =
  'mt-1 w-full rounded-[6px] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg outline-none focus:border-accent';
const labelClass = 'block text-[12px] font-medium text-fg-muted';

interface Props {
  project: AdminProject;
  credential: CredentialSummary | null;
  unassigned: CredentialSummary[];
}

export function ProjectCard({ project, credential, unassigned }: Props) {
  const id = useId();
  const [settings, save, saving] = useActionState<ActionState, FormData>(updateProject, {});
  const [key, generate, generating] = useActionState<KeyState, FormData>(createKey, {});
  const [assignment, assign, assigning] = useActionState<ActionState, FormData>(assignKey, {});
  const [revocation, revoke, revoking] = useActionState<ActionState, FormData>(revokeKey, {});

  return (
    <details className="group rounded-[6px] border border-line bg-card">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
        <span className="font-medium text-fg">{project.name}</span>
        <span className="text-fg-faint">{project.domain}</span>

        <span className="ml-auto flex items-center gap-3 text-[12px]">
          {project.active ? null : <span className="text-fg-faint">oculto</span>}
          <span className="tabular text-fg-muted">
            {project.timezone}
            {project.currency ? ` · ${project.currency}` : ''}
          </span>
          {credential ? (
            <span className="text-[var(--positive)]" title={credential.label}>
              ● clave {credential.fingerprint}
            </span>
          ) : (
            <span className="text-fg-faint">○ sin clave</span>
          )}
        </span>
      </summary>

      <div className="grid gap-5 border-t border-line px-4 py-4 md:grid-cols-2">
        {/* ── Site settings ── */}
        <form action={save}>
          <input type="hidden" name="slug" value={project.slug} />

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelClass} htmlFor={`${id}-name`}>Nombre</label>
              <input id={`${id}-name`} name="name" defaultValue={project.name} required className={fieldClass} />
            </div>

            <div>
              <label className={labelClass} htmlFor={`${id}-tz`}>Zona horaria</label>
              <input
                id={`${id}-tz`}
                name="timezone"
                defaultValue={project.timezone}
                list={`${id}-zones`}
                required
                className={fieldClass}
              />
              <datalist id={`${id}-zones`}>
                {ZONES.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </div>

            <div>
              <label className={labelClass} htmlFor={`${id}-currency`}>Moneda</label>
              <input
                id={`${id}-currency`}
                name="currency"
                defaultValue={project.currency ?? ''}
                placeholder="sin definir"
                maxLength={3}
                className={`${fieldClass} uppercase`}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor={`${id}-order`}>Orden</label>
              <input
                id={`${id}-order`}
                name="sortOrder"
                type="number"
                step={10}
                defaultValue={project.sortOrder}
                required
                className={`${fieldClass} tabular`}
              />
            </div>

            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-[12px] text-fg-muted">
                <input type="checkbox" name="active" defaultChecked={project.active} className="accent-[var(--accent)]" />
                Visible en el panel
              </label>
            </div>
          </div>

          <p className="mt-2 text-[11px] text-fg-faint">
            La zona horaria es la del sitio, no la tuya: si no coincide con la que declara
            su envío, el hub lo avisa y las series se desplazan un día. La moneda es la de
            sus ingresos (ISO 4217); en blanco se queda como esté, porque hay sitios que no
            facturan.
          </p>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-accent-contrast disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            {settings.ok ? <span className="text-[12px] text-[var(--positive)]">{settings.ok}</span> : null}
            {settings.error ? (
              <span role="alert" className="text-[12px] text-[var(--negative)]">{settings.error}</span>
            ) : null}
          </div>
        </form>

        {/* ── Submission key ── */}
        <div className="md:border-l md:border-line md:pl-5">
          <h3 className="text-[12px] font-semibold text-fg">Clave de envío</h3>

          {credential ? (
            <p className="mt-1 text-[12px] text-fg-muted">
              {credential.label} · huella <span className="tabular">{credential.fingerprint}</span>
              <br />
              <span className="text-fg-faint">
                Último envío:{' '}
                {project.lastPushAt ? formatFullDate(project.lastPushAt.slice(0, 10)) : 'ninguno todavía'}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-fg-muted">
              Sin clave: este sitio no puede enviar nada.
            </p>
          )}

          {key.secret ? <NewKey value={key.secret.value} project={key.secret.project} /> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={generate}>
              <input type="hidden" name="slug" value={project.slug} />
              <input type="hidden" name="name" value={project.name} />
              <button
                type="submit"
                disabled={generating}
                className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-fg hover:border-line-strong disabled:opacity-60"
              >
                {generating ? 'Generando…' : credential ? 'Generar otra' : 'Generar clave'}
              </button>
            </form>

            {credential ? (
              <form action={revoke}>
                <input type="hidden" name="slug" value={project.slug} />
                <button
                  type="submit"
                  disabled={revoking}
                  className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-[var(--negative)] hover:border-line-strong disabled:opacity-60"
                >
                  {revoking ? 'Revocando…' : 'Revocar'}
                </button>
              </form>
            ) : null}
          </div>

          {credential ? (
            <p className="mt-2 text-[11px] text-fg-faint">
              Generar otra deja de aceptar la anterior: el cron del proyecto dejará de
              enviar hasta que alguien cambie su <code>HUB_API_KEY</code>. Revocar no borra
              lo ya enviado.
            </p>
          ) : null}

          {unassigned.length > 0 ? (
            <form action={assign} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="slug" value={project.slug} />
              <div>
                <label className={labelClass} htmlFor={`${id}-cred`}>Usar una clave ya creada</label>
                <select id={`${id}-cred`} name="credentialId" className={fieldClass} defaultValue="">
                  <option value="" disabled>
                    Elegir…
                  </option>
                  {unassigned.map((free) => (
                    <option key={free.id} value={free.id}>
                      {free.label} ({free.fingerprint})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={assigning}
                className="rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-fg disabled:opacity-60"
              >
                {assigning ? 'Asignando…' : 'Asignar'}
              </button>
            </form>
          ) : null}

          {[key.error, assignment.error, revocation.error].filter(Boolean).map((error) => (
            <p key={error} role="alert" className="mt-2 text-[12px] text-[var(--negative)]">
              {error}
            </p>
          ))}
          {[assignment.ok, revocation.ok].filter(Boolean).map((ok) => (
            <p key={ok} className="mt-2 text-[12px] text-[var(--positive)]">
              {ok}
            </p>
          ))}
        </div>
      </div>
    </details>
  );
}

/**
 * The plaintext key, which is only shown once.
 *
 * It can't be looked up again: in the database it's stored encrypted. That's
 * why it takes up space, can be copied in one click and says so out loud
 * instead of sitting there as just another detail of the card.
 */
function NewKey({ value, project }: { value: string; project: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-3 rounded-[6px] border border-accent bg-[var(--accent-soft)] p-3">
      <p className="text-[12px] font-semibold text-fg">
        Clave nueva de {project}. Cópiala ahora: no se puede volver a consultar.
      </p>
      <code className="mt-2 block break-all rounded-[4px] bg-surface px-2 py-1.5 text-[12px] text-fg">
        {value}
      </code>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value).then(() => setCopied(true));
          }}
          className="rounded-full border border-line px-3 py-1 text-[12px] font-medium text-fg"
        >
          {copied ? 'Copiada' : 'Copiar'}
        </button>
        <span className="text-[11px] text-fg-faint">
          Va en <code>HUB_API_KEY</code> del proyecto.
        </span>
      </div>
    </div>
  );
}
