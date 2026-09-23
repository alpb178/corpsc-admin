-- País, procedencia y campaña de cada visita. El horario no necesita columna:
-- sale de occurred_at en la zona del proyecto.

-- AlterTable
ALTER TABLE "site_event" ADD COLUMN "country" VARCHAR(2),
ADD COLUMN "referrer" VARCHAR(255),
ADD COLUMN "utm_source" VARCHAR(100),
ADD COLUMN "utm_medium" VARCHAR(100),
ADD COLUMN "utm_campaign" VARCHAR(100);
