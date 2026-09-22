-- El hub se queda con los cinco sitios del ecosistema: el corporativo y los
-- cuatro productos. Los demás del catálogo del portfolio no pertenecen a él y
-- nunca tuvieron integración. Sus filas de metric_daily, site_event e
-- ingestion_run caen en cascada; una clave que tuvieran asignada queda sin
-- proyecto y se ve en Ajustes.
DELETE FROM "project"
WHERE "slug" IN (
  'humancore', 'histolword', 'dandomuela',
  'kods-ai', 'popyplan', 'zendinit', 'orlegitech', 'tikneo', 'calculum', 'emasex'
);
