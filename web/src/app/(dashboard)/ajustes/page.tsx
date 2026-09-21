import { redirect } from 'next/navigation';

/** `/ajustes` no es una pantalla: entra por la primera pestaña. */
export default function AjustesPage() {
  redirect('/ajustes/proyectos');
}
