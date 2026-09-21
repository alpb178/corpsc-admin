/** Ocho slots categóricos validados. La novena serie no es una tinta nueva. */
export const MAX_SERIES = 8;

/**
 * Asigna un slot de color a cada sitio de forma ESTABLE.
 *
 * La regla que esto respeta: el color sigue a la entidad, nunca a su posición
 * en el ranking. Si se asignara por índice del array, quitar un sitio de la
 * comparación repintaría a todos los que quedan, y quien estuviera leyendo la
 * gráfica tendría que volver a aprenderse los colores.
 *
 * El slot sale de la posición del sitio en el catálogo completo, que no cambia
 * al filtrar. Como hay catorce sitios y ocho tintas, dos pueden caer en el
 * mismo slot; solo estorba si ambos están seleccionados a la vez, y en ese
 * caso el segundo pasa al primer slot libre.
 */
export function assignSlots(selected: string[], canonicalOrder: string[]): Map<string, number> {
  const slots = new Map<string, number>();
  const taken = new Set<number>();

  // Se recorre en orden del catálogo, no en el de selección: así el reparto no
  // depende de en qué orden se hayan ido pulsando los sitios.
  const ordered = canonicalOrder.filter((slug) => selected.includes(slug));

  for (const slug of ordered) {
    const preferred = (canonicalOrder.indexOf(slug) % MAX_SERIES) + 1;

    let slot = preferred;
    while (taken.has(slot)) slot = (slot % MAX_SERIES) + 1;

    taken.add(slot);
    slots.set(slug, slot);
  }

  return slots;
}
