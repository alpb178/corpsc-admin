-- Contract v2 of /ingest/events: visitors, devices, finer location and custom
-- events. Every new column is nullable so v1 senders keep working while the
-- five sites migrate one by one.

-- AlterEnum
ALTER TYPE "SiteEventType" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "site_event" ADD COLUMN     "browser" VARCHAR(32),
ADD COLUMN     "city" VARCHAR(100),
ADD COLUMN     "device" VARCHAR(16),
ADD COLUMN     "event_id" UUID,
ADD COLUMN     "language" VARCHAR(8),
ADD COLUMN     "name" VARCHAR(64),
ADD COLUMN     "os" VARCHAR(32),
ADD COLUMN     "props" JSONB,
ADD COLUMN     "region" VARCHAR(8),
ADD COLUMN     "screen" VARCHAR(16),
ADD COLUMN     "visitor_id" VARCHAR(64);

-- CreateTable
CREATE TABLE "visitor_daily" (
    "project_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visitor_id" VARCHAR(64) NOT NULL,

    CONSTRAINT "visitor_daily_pkey" PRIMARY KEY ("project_id","date","visitor_id")
);

-- CreateTable
CREATE TABLE "conversion_goal" (
    "project_id" TEXT NOT NULL,
    "event_name" VARCHAR(64) NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversion_goal_pkey" PRIMARY KEY ("project_id","event_name")
);

-- CreateIndex
CREATE INDEX "visitor_daily_project_id_visitor_id_date_idx" ON "visitor_daily"("project_id", "visitor_id", "date");

-- Real time across the whole group reads the last few minutes of every project.
-- CreateIndex
CREATE INDEX "site_event_occurred_at_idx" ON "site_event"("occurred_at");

-- A beacon sent twice is stored once. v1 events carry no event_id, and NULLs
-- never collide in a unique index.
-- CreateIndex
CREATE UNIQUE INDEX "site_event_project_id_event_id_key" ON "site_event"("project_id", "event_id");

-- AddForeignKey
ALTER TABLE "visitor_daily" ADD CONSTRAINT "visitor_daily_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_goal" ADD CONSTRAINT "conversion_goal_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The metrics the rollup will produce from these events. They go here and not
-- only in the seed because production isn't seeded again: without the
-- definition, the panel doesn't show them.
INSERT INTO "metric_definition" ("key", "label", "label_en", "unit", "aggregation", "active", "sort_order", "updated_at")
VALUES
  ('new_visitors',  'Visitantes nuevos',       'New visitors',  'COUNT', 'SUM', true, 15, CURRENT_TIMESTAMP),
  ('custom_events', 'Eventos personalizados',  'Custom events', 'COUNT', 'SUM', true, 95, CURRENT_TIMESTAMP),
  ('conversions',   'Conversiones',            'Conversions',   'COUNT', 'SUM', true, 105, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
