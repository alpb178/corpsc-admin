import { redirect } from 'next/navigation';

/** `/settings` isn't a screen: it opens on the first tab. */
export default function SettingsPage() {
  redirect('/settings/projects');
}
