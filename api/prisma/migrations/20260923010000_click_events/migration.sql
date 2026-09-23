-- Clics dentro de la propia página: dónde se hace clic, no solo qué se visita.

-- AlterEnum
ALTER TYPE "SiteEventType" ADD VALUE 'CLICK';

-- AlterTable
ALTER TABLE "site_event" ADD COLUMN "section" VARCHAR(64),
ADD COLUMN "label" VARCHAR(120);

-- La métrica que produce la consolidación. Va aquí y no solo en el seed porque
-- producción no se vuelve a sembrar: sin la definición, el panel no la enseña.
INSERT INTO "metric_definition" ("key", "label", "label_en", "unit", "aggregation", "active", "sort_order", "updated_at")
VALUES ('clicks', 'Clics', 'Clicks', 'COUNT', 'SUM', true, 85, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
