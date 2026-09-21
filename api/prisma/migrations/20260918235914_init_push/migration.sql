-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('OWN', 'CLIENT');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('API_KEY');

-- CreateEnum
CREATE TYPE "MetricUnit" AS ENUM ('COUNT', 'SECONDS', 'RATIO', 'CURRENCY', 'POSITION');

-- CreateEnum
CREATE TYPE "Aggregation" AS ENUM ('SUM', 'WEIGHTED_AVG', 'LAST', 'MAX');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('PUSH', 'BACKFILL');

-- CreateTable
CREATE TABLE "hub_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hub_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "domain" VARCHAR(255) NOT NULL,
    "kind" "ProjectKind" NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/La_Paz',
    "currency" VARCHAR(3),
    "credential_id" TEXT,
    "last_push_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential" (
    "id" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "label" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "fingerprint" VARCHAR(16) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_definition" (
    "key" VARCHAR(64) NOT NULL,
    "label" TEXT NOT NULL,
    "label_en" TEXT,
    "unit" "MetricUnit" NOT NULL,
    "aggregation" "Aggregation" NOT NULL DEFAULT 'SUM',
    "derived_from" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_definition_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "metric_daily" (
    "id" BIGSERIAL NOT NULL,
    "project_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "metric_key" VARCHAR(64) NOT NULL,
    "dimension" VARCHAR(32) NOT NULL,
    "dim_value" VARCHAR(512) NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "currency" VARCHAR(3),
    "run_id" TEXT,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_run" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "trigger" "RunTrigger" NOT NULL,
    "status" "RunStatus" NOT NULL,
    "window_from" DATE NOT NULL,
    "window_to" DATE NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_ms" INTEGER,
    "rows_written" INTEGER NOT NULL DEFAULT 0,
    "rows_deleted" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "warnings" JSONB,

    CONSTRAINT "ingestion_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hub_user_email_key" ON "hub_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "project_slug_key" ON "project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "project_domain_key" ON "project"("domain");

-- CreateIndex
CREATE INDEX "project_active_sort_order_idx" ON "project"("active", "sort_order");

-- CreateIndex
CREATE INDEX "metric_daily_project_id_metric_key_dimension_date_idx" ON "metric_daily"("project_id", "metric_key", "dimension", "date");

-- CreateIndex
CREATE INDEX "metric_daily_project_id_date_idx" ON "metric_daily"("project_id", "date");

-- CreateIndex
CREATE INDEX "metric_daily_run_id_idx" ON "metric_daily"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_daily_project_id_date_metric_key_dimension_dim_value_key" ON "metric_daily"("project_id", "date", "metric_key", "dimension", "dim_value");

-- CreateIndex
CREATE INDEX "ingestion_run_project_id_received_at_idx" ON "ingestion_run"("project_id", "received_at" DESC);

-- CreateIndex
CREATE INDEX "ingestion_run_status_received_at_idx" ON "ingestion_run"("status", "received_at" DESC);

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ingestion_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_run" ADD CONSTRAINT "ingestion_run_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
