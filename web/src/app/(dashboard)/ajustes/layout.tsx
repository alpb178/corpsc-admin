import { requireRole } from '@/lib/dal';
import { SettingsTabs } from './SettingsTabs';

/**
 * Ajustes del hub: lo que se configura una vez y casi nunca se toca.
 *
 * `requireRole` aquí no basta —un layout no protege una Server Function—, así
 * que cada página y cada acción vuelven a comprobarlo. Esto solo evita que
 * alguien llegue a ver la pantalla.
 */
export default async function AjustesLayout({ children }: { children: React.ReactNode }) {
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
