import { requireRole } from '@/lib/dal';
import { SettingsTabs } from './SettingsTabs';

/**
 * Hub settings: what gets configured once and is hardly ever touched.
 *
 * `requireRole` here isn't enough —a layout doesn't protect a Server
 * Function—, so every page and every action checks it again. This only keeps
 * someone from getting to see the screen.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireRole('ADMIN');

  return (
    <>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold text-fg">Ajustes</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] text-fg-muted">
          Quién envía, con qué clave y en qué zona horaria; y quién entra al panel.
        </p>
      </div>

      <SettingsTabs />

      <div className="mt-4">{children}</div>
    </>
  );
}
