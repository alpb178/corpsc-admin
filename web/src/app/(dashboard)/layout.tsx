import { Suspense } from 'react';
import { requireUser } from '@/lib/dal';
import { api } from '@/lib/api';
import { AppDrawer } from '@/components/AppDrawer';
import type { AdminProject } from '@/lib/types';
import type { NavProject } from '@/lib/navigation';

/**
 * The panel's frame: a drawer with the dashboard, one entry per site and the
 * tools. The session check lives here and in every page and action, not in
 * the proxy.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // The sites of the drawer, in the order set in Settings. If the API can't
  // list them the panel still opens: each page shows its own error, and the
  // drawer keeps the dashboard and the tools.
  let projects: NavProject[] = [];
  try {
    projects = (await api<AdminProject[]>('/projects')).map((p) => ({ slug: p.slug, name: p.name }));
  } catch {
    projects = [];
  }

  return (
    // The drawer reads the range from the URL to keep it between views.
    <Suspense>
      <AppDrawer projects={projects} user={user}>
        {children}
      </AppDrawer>
    </Suspense>
  );
}
