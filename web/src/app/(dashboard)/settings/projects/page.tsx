import { api, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/dal';
import { ErrorPanel } from '@/components/ErrorPanel';
import { ProjectCard } from './ProjectCard';
import type { AdminProject, CredentialSummary } from '@/lib/types';

/**
 * The group's sites and their submission key.
 *
 * They're requested **including the inactive ones**: this is the only screen
 * from which they can be reactivated, so hiding them here would leave them
 * with no way back.
 */
export default async function ProjectsPage() {
  await requireRole('ADMIN');

  let projects: AdminProject[];
  let credentials: CredentialSummary[];

  try {
    [projects, credentials] = await Promise.all([
      api<AdminProject[]>('/projects', { includeInactive: 'true' }),
      api<CredentialSummary[]>('/credentials'),
    ]);
  } catch (error) {
    return (
      <ErrorPanel
        title="No se pudieron cargar los proyectos"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  const withKey = projects.filter((p) => p.credentialId !== null).length;
  const groups = [
    { title: 'Productos propios', items: projects.filter((p) => p.kind === 'OWN') },
    { title: 'Sitios de clientes', items: projects.filter((p) => p.kind === 'CLIENT') },
  ].filter((group) => group.items.length > 0);

  return (
    <>
      <p className="mb-4 max-w-[80ch] text-[13px] text-fg-muted">
        <strong className="font-semibold text-fg">
          {withKey} de {projects.length} sitios
        </strong>{' '}
        tienen clave y pueden enviar. Un sitio sin clave no es un sitio con cero
        visitas: no aparece en las cifras del grupo y en Envíos figura como que nunca
        ha enviado.
      </p>

      {groups.map((group) => (
        <section key={group.title} className="mb-5">
          <h2 className="mb-2 text-[13px] font-semibold text-fg">{group.title}</h2>
          <div className="space-y-2">
            {group.items.map((project) => (
              <ProjectCard
                key={project.slug}
                project={project}
                credential={credentials.find((c) => c.id === project.credentialId) ?? null}
                // Keys created that nobody uses: usually one from a project that
                // was revoked and is meant to be reassigned.
                unassigned={credentials.filter((c) => c.projects.length === 0)}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
