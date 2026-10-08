import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { formatMetric } from '@/lib/format';
import { FreshnessBadge } from '@/components/FreshnessBadge';
import { ErrorPanel } from '@/components/ErrorPanel';
import { DataTable } from '@/components/DataTable';
import type { ProjectFreshness } from '@/lib/types';

interface Run {
  id: string;
  trigger: string;
  status: 'SUCCESS' | 'PARTIAL' | 'REJECTED';
  windowFrom: string;
  windowTo: string;
  receivedAt: string;
  rowsWritten: number;
  rowsDeleted: number;
  errorCode: string | null;
  errorMessage: string | null;
  warnings: string[] | null;
  project: { slug: string; name: string };
}

const STATUS: Record<Run['status'], { label: string; tone: string }> = {
  SUCCESS: { label: 'aceptado', tone: 'text-[var(--positive)]' },
  PARTIAL: { label: 'con avisos', tone: 'text-fg-subtle' },
  REJECTED: { label: 'rechazado', tone: 'text-[var(--negative)]' },
};

/**
 * Who has sent and when.
 *
 * This page exists because the hub receives instead of going out to fetch: if
 * a project's cron breaks, nothing visible fails — data simply stops arriving
 * and the chart goes flat. Here the silence shows.
 */
export default async function SubmissionsPage() {
  let freshness: ProjectFreshness[];
  let runs: Run[];

  try {
    [freshness, runs] = await Promise.all([
      api<ProjectFreshness[]>('/metrics/freshness'),
      api<Run[]>('/metrics/runs'),
    ]);
  } catch (error) {
    return (
      <ErrorPanel
        title="No se pudo cargar el estado de los envíos"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  const failing = freshness.filter((f) => f.freshness === 'STALE' || f.freshness === 'NEVER');

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-fg">Envíos</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-fg-muted">
          Cada proyecto envía sus agregados diarios al hub. Si uno deja de hacerlo, sus
          gráficas se quedan planas sin que falle nada: por eso el silencio se vigila aquí.
        </p>
      </div>

      {failing.length > 0 ? (
        <div role="alert" className="mb-4 card px-4 py-3">
          <p className="text-[13px] font-medium text-fg">
            {failing.length === 1 ? 'Un proyecto lleva' : `${failing.length} proyectos llevan`} sin enviar
          </p>
          <p className="mt-1 text-[12px] text-fg-muted">
            {failing.map((p) => p.name).join(', ')}
          </p>
        </div>
      ) : null}

      <section className="card">
        <h2 className="border-b border-line px-4 py-3 text-[13px] font-semibold text-fg">
          Estado por proyecto
        </h2>
        <ul className="divide-y divide-line">
          {freshness.length === 0 ? (
            <li className="px-4 py-4 text-[13px] text-fg-faint">
              Ningún proyecto tiene clave de envío asignada todavía.
            </li>
          ) : (
            freshness.map((f) => (
              <li key={f.slug} className="flex items-center justify-between gap-4 px-4 py-2.5">
                <Link href={`/projects/${f.slug}`} className="text-[13px] font-medium text-fg hover:text-accent">
                  {f.name}
                </Link>
                <FreshnessBadge freshness={f.freshness} hoursSince={f.hoursSince} />
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="mt-3">
        <DataTable
          title="Últimos envíos recibidos"
          columns={[
            { key: 'project', label: 'Proyecto' },
            { key: 'period', label: 'Periodo' },
            { key: 'written', label: 'Escritas', align: 'right' },
            { key: 'deleted', label: 'Borradas', align: 'right' },
            { key: 'status', label: 'Estado' },
          ]}
          rows={runs.map((run) => ({
            id: run.id,
            cells: {
              project: <span className="font-medium text-fg">{run.project.name}</span>,
              period: (
                <span className="tabular whitespace-nowrap text-fg-muted">
                  {run.windowFrom.slice(0, 10)} → {run.windowTo.slice(0, 10)}
                </span>
              ),
              written: <span className="text-fg">{formatMetric(run.rowsWritten)}</span>,
              deleted: <span className="text-fg-muted">{formatMetric(run.rowsDeleted)}</span>,
              status: (
                <>
                  <span className={STATUS[run.status].tone}>{STATUS[run.status].label}</span>
                  {run.errorMessage ? (
                    <p className="mt-1 max-w-[46ch] text-[12px] text-fg-faint">{run.errorMessage}</p>
                  ) : null}
                  {run.warnings?.map((w) => (
                    <p key={w} className="mt-1 max-w-[46ch] text-[12px] text-fg-faint">{w}</p>
                  ))}
                </>
              ),
            },
          }))}
          emptyText="Todavía no ha llegado ningún envío."
        />
      </div>
    </>
  );
}
