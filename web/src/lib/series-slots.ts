/** Eight validated categorical slots. The ninth series is not a new hue. */
export const MAX_SERIES = 8;

/**
 * Assigns each site a colour slot in a STABLE way.
 *
 * The rule this honours: colour follows the entity, never its position in the
 * ranking. If it were assigned by array index, removing a site from the
 * comparison would repaint all the remaining ones, and whoever was reading the
 * chart would have to learn the colours all over again.
 *
 * The slot comes from the site's position in the full catalogue, which doesn't
 * change when filtering. With fourteen sites and eight hues, two can land on
 * the same slot; that only gets in the way if both are selected at once, and
 * in that case the second moves to the first free slot.
 */
export function assignSlots(selected: string[], canonicalOrder: string[]): Map<string, number> {
  const slots = new Map<string, number>();
  const taken = new Set<number>();

  // Walk in catalogue order, not selection order: that way the assignment
  // doesn't depend on the order in which the sites were clicked.
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
