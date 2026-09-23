import { api, ApiError } from '@/lib/api';
import { requireRole } from '@/lib/dal';
import { ErrorPanel } from '@/components/ErrorPanel';
import { NewUserForm } from './NewUserForm';
import type { HubUserRow } from '@/lib/types';

const ROLE_LABEL: Record<HubUserRow['role'], string> = {
  ADMIN: 'Administrador',
  ANALYST: 'Analista',
  VIEWER: 'Lectura',
};

const dateFormat = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', year: 'numeric' });

export default async function UsersPage() {
  const current = await requireRole('ADMIN');

  let users: HubUserRow[];
  try {
    users = await api<HubUserRow[]>('/auth/users');
  } catch (error) {
    return (
      <ErrorPanel
        title="No se pudieron cargar los usuarios"
        message={error instanceof ApiError ? error.message : 'Error inesperado.'}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="overflow-x-auto rounded-[6px] border border-line bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-fg-faint">
              <th scope="col" className="px-4 py-2 font-medium">Nombre</th>
              <th scope="col" className="px-4 py-2 font-medium">Rol</th>
              <th scope="col" className="px-4 py-2 font-medium">Último acceso</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg">
                  {user.name}
                  {user.id === current.id ? <span className="text-fg-faint"> · tú</span> : null}
                  <span className="block text-[12px] font-normal text-fg-faint">{user.email}</span>
                </th>
                <td className="px-4 py-2.5 text-fg-muted">
                  {ROLE_LABEL[user.role]}
                  {user.active ? null : <span className="block text-[12px] text-fg-faint">desactivado</span>}
                </td>
                <td className="px-4 py-2.5 text-fg-muted">
                  {user.lastLoginAt ? dateFormat.format(new Date(user.lastLoginAt)) : 'nunca ha entrado'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div>
        <NewUserForm />
        <p className="mt-3 text-[11px] text-fg-faint">
          Cambiar el rol de alguien o darle de baja todavía no se puede desde aquí: la API
          solo expone alta y listado.
        </p>
      </div>
    </div>
  );
}
