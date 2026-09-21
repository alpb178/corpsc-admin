'use client';

import { useSyncExternalStore } from 'react';

/**
 * El modo oscuro no es un volteo automático de colores: tiene sus propios
 * pasos de paleta, validados contra la superficie navy. Esto solo decide cuál
 * de los dos conjuntos se aplica.
 *
 * La fuente de verdad es la clase de <html>, que pone un script en línea antes
 * de pintar para que no haya fogonazo. Se lee con `useSyncExternalStore` y no
 * con un efecto: el estado ya existe fuera de React, y copiarlo dentro con
 * `setState` en un `useEffect` provoca un render de más en cada montaje.
 */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains('dark');

export function ThemeToggle() {
  // En el servidor no hay <html> que consultar; se asume claro y el primer
  // render en cliente lo corrige sin parpadeo porque el script ya puso la clase.
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    document.documentElement.classList.toggle('light', !next);
    try {
      localStorage.setItem('tema', next ? 'dark' : 'light');
    } catch {
      // Modo privado o almacenamiento bloqueado: el tema no se recuerda, pero
      // la página sigue funcionando.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="rounded-full border border-line px-2.5 py-1.5 text-[12px] text-fg-muted hover:text-fg"
    >
      <span aria-hidden>{dark ? '☀' : '☾'}</span>
    </button>
  );
}
