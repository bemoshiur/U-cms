import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_page_views_os_family" AS ENUM('windows', 'macos', 'ios', 'android', 'linux', 'other');
  CREATE TYPE "public"."enum_page_views_browser_family" AS ENUM('chrome', 'safari', 'firefox', 'edge', 'opera', 'samsung', 'ie', 'other');
  CREATE TABLE "traffic_daily" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"date" varchar NOT NULL,
  	"total_views" numeric DEFAULT 0 NOT NULL,
  	"unique_visitors" numeric DEFAULT 0 NOT NULL,
  	"by_path" jsonb,
  	"by_os" jsonb,
  	"by_browser" jsonb,
  	"by_device" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "page_views" ADD COLUMN "os_family" "enum_page_views_os_family";
  ALTER TABLE "page_views" ADD COLUMN "browser_family" "enum_page_views_browser_family";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "traffic_daily_id" integer;
  ALTER TABLE "traffic_daily" ADD CONSTRAINT "traffic_daily_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "traffic_daily_tenant_idx" ON "traffic_daily" USING btree ("tenant_id");
  CREATE INDEX "traffic_daily_updated_at_idx" ON "traffic_daily" USING btree ("updated_at");
  CREATE INDEX "traffic_daily_created_at_idx" ON "traffic_daily" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_date_idx" ON "traffic_daily" USING btree ("tenant_id","date");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_traffic_daily_fk" FOREIGN KEY ("traffic_daily_id") REFERENCES "public"."traffic_daily"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_traffic_daily_id_idx" ON "payload_locked_documents_rels" USING btree ("traffic_daily_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "traffic_daily" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "traffic_daily" CASCADE;
  -- IF EXISTS: the DROP TABLE ... CASCADE above already removes any FK constraint
  -- on payload_locked_documents_rels that references the dropped table, so the
  -- explicit drops below must be idempotent for a clean down round-trip
  -- (Phase-2 D2 / Task 4E pattern).
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_traffic_daily_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_traffic_daily_id_idx";
  ALTER TABLE "page_views" DROP COLUMN IF EXISTS "os_family";
  ALTER TABLE "page_views" DROP COLUMN IF EXISTS "browser_family";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "traffic_daily_id";
  DROP TYPE IF EXISTS "public"."enum_page_views_os_family";
  DROP TYPE IF EXISTS "public"."enum_page_views_browser_family";`)
}
