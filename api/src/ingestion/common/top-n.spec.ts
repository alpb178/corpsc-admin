import { collapseToTopN, normalizeUrl } from './top-n';
import { OTHER, type MetricRow } from './metric-row';

function row(date: string, dimValue: string, value: number, metricKey = 'sessions'): MetricRow {
  return { date, metricKey, dimension: 'country', dimValue, value };
}

describe('collapseToTopN', () => {
  it('conserva el top-N y suma el resto en __other__', () => {
    const rows = [
      row('2026-03-01', 'BO', 100),
      row('2026-03-01', 'AR', 50),
      row('2026-03-01', 'CL', 10),
      row('2026-03-01', 'PE', 5),
    ];

    const out = collapseToTopN(rows, { dimension: 'country', topN: 2, rankBy: 'sessions' });
    const byValue = Object.fromEntries(out.map((r) => [r.dimValue, r.value]));

    expect(byValue).toEqual({ BO: 100, AR: 50, [OTHER]: 15 });
  });

  it('el desglose sigue sumando el total (que es para lo que existe __other__)', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row('2026-03-01', `pais-${i}`, i + 1));
    const total = rows.reduce((n, r) => n + r.value, 0);

    const out = collapseToTopN(rows, { dimension: 'country', topN: 10, rankBy: 'sessions' });

    expect(out.reduce((n, r) => n + r.value, 0)).toBe(total);
  });

  it('no crea __other__ si todo cabe en el top', () => {
    const rows = [row('2026-03-01', 'BO', 100), row('2026-03-01', 'AR', 50)];
    const out = collapseToTopN(rows, { dimension: 'country', topN: 10, rankBy: 'sessions' });

    expect(out.some((r) => r.dimValue === OTHER)).toBe(false);
  });

  it('decide el top por día, no para el rango entero', () => {
    // Un país puede liderar un día y no el siguiente; si el top se decidiera
    // para todo el rango, el día flojo perdería su propio líder.
    const rows = [
      row('2026-03-01', 'BO', 100),
      row('2026-03-01', 'AR', 1),
      row('2026-03-02', 'AR', 100),
      row('2026-03-02', 'BO', 1),
    ];

    const out = collapseToTopN(rows, { dimension: 'country', topN: 1, rankBy: 'sessions' });

    expect(out.filter((r) => r.date === '2026-03-01' && r.dimValue === 'BO')).toHaveLength(1);
    expect(out.filter((r) => r.date === '2026-03-02' && r.dimValue === 'AR')).toHaveLength(1);
  });

  it('arrastra todas las métricas de las filas que van a __other__', () => {
    const rows = [
      row('2026-03-01', 'BO', 100),
      row('2026-03-01', 'CL', 5),
      row('2026-03-01', 'CL', 3, 'new_users'),
      row('2026-03-01', 'PE', 2, 'new_users'),
    ];

    const out = collapseToTopN(rows, { dimension: 'country', topN: 1, rankBy: 'sessions' });
    const other = out.filter((r) => r.dimValue === OTHER);

    expect(other.find((r) => r.metricKey === 'sessions')?.value).toBe(5);
    expect(other.find((r) => r.metricKey === 'new_users')?.value).toBe(5);
  });

  it('ignora las filas de otras dimensiones', () => {
    const rows = [row('2026-03-01', 'BO', 100), { ...row('2026-03-01', 'movil', 7), dimension: 'device' }];
    const out = collapseToTopN(rows, { dimension: 'country', topN: 10, rankBy: 'sessions' });

    expect(out).toHaveLength(1);
  });
});

describe('normalizeUrl', () => {
  it('quita el host propio y deja la ruta', () => {
    expect(normalizeUrl('https://tu-chamba.corpsc.com/ofertas/123', 'tu-chamba.corpsc.com')).toBe(
      '/ofertas/123',
    );
  });

  it('conserva el host si es de otro dominio', () => {
    expect(normalizeUrl('https://otro.com/x', 'tu-chamba.corpsc.com')).toBe('otro.com/x');
  });

  it('descarta los parámetros de campaña pero conserva los que cambian la página', () => {
    // Sin esto, la misma página aparece decenas de veces como filas distintas.
    expect(normalizeUrl('https://x.com/ofertas?utm_source=fb&utm_campaign=marzo&page=2', 'x.com')).toBe(
      '/ofertas?page=2',
    );
  });

  it('trunca a 512 caracteres para no desbordar la columna', () => {
    const largo = `https://x.com/${'a'.repeat(900)}`;
    expect(normalizeUrl(largo, 'x.com').length).toBe(512);
  });

  it('deja pasar lo que no es una URL', () => {
    expect(normalizeUrl('/ruta/suelta')).toBe('/ruta/suelta');
  });
});
