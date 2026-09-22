-- CreateEnum
CREATE TYPE "SiteEventType" AS ENUM ('PAGE_VIEW', 'SITE_CLICK');

-- AlterEnum
ALTER TYPE "RunTrigger" ADD VALUE 'ROLLUP';

-- CreateTable
CREATE TABLE "site_event" (
    "id" BIGSERIAL NOT NULL,
    "project_id" TEXT NOT NULL,
    "type" "SiteEventType" NOT NULL,
    "session_id" VARCHAR(64) NOT NULL,
    "path" VARCHAR(512) NOT NULL,
    "target" VARCHAR(64),
    "link_type" VARCHAR(16),
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_event_project_id_occurred_at_idx" ON "site_event"("project_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "site_event" ADD CONSTRAINT "site_event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
