import { StatTile } from './StatTile';
import type { Comparison, MetricTotals } from '@/lib/types';

/** Métricas de negocio que el hub conoce, en el orden en que se muestran. */
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
 * KPIs que vienen del endpoint interno de cada proyecto.
 *
 * Solo se pintan las que ese proyecto envía de verdad: una tienda no publica
 * ofertas de empleo y un portal de empleo no factura. Enseñar "Pedidos 0" en
 * Tu Chamba sería inventarse una métrica que allí no significa nada.
 *
 * `revenue` se deja fuera a propósito: es dinero y necesita su moneda, así que
 * lo lleva `RevenueTile` aparte.
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
