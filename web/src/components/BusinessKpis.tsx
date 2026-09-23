import { StatTile } from './StatTile';
import type { Comparison, MetricTotals } from '@/lib/types';

/** Business metrics the hub knows about, in the order they're shown. */
const BUSINESS = [
  { key: 'orders', label: 'Pedidos', unit: 'COUNT' },
  { key: 'orders_cancelled', label: 'Pedidos cancelados', unit: 'COUNT' },
  { key: 'add_to_cart', label: 'Añadidos al carrito', unit: 'COUNT' },
  { key: 'orders_paid', label: 'Pedidos cobrados', unit: 'COUNT' },
  { key: 'leads', label: 'Contactos', unit: 'COUNT' },
  { key: 'signups', label: 'Altas', unit: 'COUNT' },
  { key: 'publications', label: 'Publicaciones', unit: 'COUNT' },
  { key: 'invoices', label: 'Facturas', unit: 'COUNT' },
] as const;

/**
 * KPIs that come from each project's internal endpoint.
 *
 * Only the ones that project actually sends are drawn: a shop doesn't post job
 * offers and a job board doesn't bill. Showing "Pedidos 0" on Tu Chamba would
 * be inventing a metric that means nothing there.
 *
 * `revenue` is left out on purpose: it's money and needs its currency, so
 * `RevenueTile` handles it separately.
 */
export function BusinessKpis({
  totals,
  comparison,
}: {
  totals: MetricTotals;
  comparison?: Comparison;
}) {
  const present = BUSINESS.filter((m) => totals[m.key] !== undefined);
  if (present.length === 0) return null;

  return (
    <section aria-label="Indicadores de negocio" className="mt-6">
      <h2 className="mb-3 text-[15px] font-semibold text-fg">Negocio</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {present.map((m) => (
          <StatTile
            key={m.key}
            label={m.label}
            value={totals[m.key]}
            unit={m.unit}
            delta={comparison?.deltas[m.key]}
          />
        ))}
      </div>
    </section>
  );
}
