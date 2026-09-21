-- Dos índices parciales que Prisma no sabe expresar: @@index no admite WHERE.
-- Son los que sostienen las dos consultas dominantes del panel.

-- Portada comparativa de los 14 sitios. Cubre solo las filas agregadas, una
-- fracción pequeña de la tabla, así que el índice es diminuto; el INCLUDE deja
-- resolver la consulta sin tocar la tabla (index-only scan).
CREATE INDEX IF NOT EXISTS metric_daily_overview_idx
  ON metric_daily (date, metric_key, project_id)
  INCLUDE (value)
  WHERE dimension = 'total';

-- Top-N por dimensión dentro de un rango: países, rutas, estados.
CREATE INDEX IF NOT EXISTS metric_daily_dimvalue_idx
  ON metric_daily (project_id, dimension, metric_key, date, value DESC)
  WHERE dimension <> 'total';
