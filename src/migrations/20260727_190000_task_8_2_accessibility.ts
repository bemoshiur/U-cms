import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Phase 8, Task 8.2 — Web-accessibility auto-diagnosis (refs 2-21..2-23).
// Adds ONE tenant-scoped collection, accessibility_scan_results (one row per
// inspected screen per scan run: the 2-21 summary columns + the per-violation
// detail JSON for the 2-22 pane), with its `source` enum, the tenant → sites FK
// + indexes (tenant/inspected_at aggregation), and the payload_locked_documents_rels
// wiring Payload adds for every collection.
//
// Generated programmatically from the config diff (the payload CLI cannot load
// the config in this repo's local toolchain — see task-8-1a-report.md), then
// given an IF-EXISTS-guarded `down` for a clean, idempotent round-trip (project
// convention — cf. task_8_1b_standardization_engine).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_accessibility_scan_results_source" AS ENUM('scan', 'popup', 'db');
  CREATE TABLE "accessibility_scan_results" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"screen_name" varchar NOT NULL,
  	"route" varchar NOT NULL,
  	"source" "enum_accessibility_scan_results_source" DEFAULT 'scan' NOT NULL,
  	"inspected_at" timestamp(3) with time zone NOT NULL,
  	"total_items" numeric DEFAULT 0,
  	"success_count" numeric DEFAULT 0,
  	"error_count" numeric DEFAULT 0,
  	"critical_count" numeric DEFAULT 0,
  	"danger_count" numeric DEFAULT 0,
  	"warning_count" numeric DEFAULT 0,
  	"violations" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "accessibility_scan_results_id" integer;
  ALTER TABLE "accessibility_scan_results" ADD CONSTRAINT "accessibility_scan_results_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "accessibility_scan_results_tenant_idx" ON "accessibility_scan_results" USING btree ("tenant_id");
  CREATE INDEX "accessibility_scan_results_inspected_at_idx" ON "accessibility_scan_results" USING btree ("inspected_at");
  CREATE INDEX "accessibility_scan_results_updated_at_idx" ON "accessibility_scan_results" USING btree ("updated_at");
  CREATE INDEX "accessibility_scan_results_created_at_idx" ON "accessibility_scan_results" USING btree ("created_at");
  CREATE INDEX "tenant_inspectedAt_idx" ON "accessibility_scan_results" USING btree ("tenant_id","inspected_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_accessibility_scan_results_fk" FOREIGN KEY ("accessibility_scan_results_id") REFERENCES "public"."accessibility_scan_results"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_accessibility_scan_results_idx" ON "payload_locked_documents_rels" USING btree ("accessibility_scan_results_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "accessibility_scan_results" CASCADE;
  -- The DROP TABLE ... CASCADE above removes the FK constraint + index that
  -- reference this table from payload_locked_documents_rels, so the explicit
  -- drops below must be IF-EXISTS for a clean, idempotent down round-trip.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_accessibility_scan_results_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_accessibility_scan_results_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "accessibility_scan_results_id";
  DROP TYPE IF EXISTS "public"."enum_accessibility_scan_results_source";`)
}
