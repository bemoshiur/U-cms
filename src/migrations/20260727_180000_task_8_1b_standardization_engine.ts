import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Phase 8, Task 8.1b — Public-data Standardization ENGINE (refs 1-66..1-76).
// Adds three GLOBAL (non-tenant) collections — standardizationProposals (the DBA
// proposal work-queue), tableStandardSettings (per-table source assignment), and
// standardizationSelfChecks (monthly 8-error-type snapshots) — with their select
// enums, the natural-key indexes (table_name unique; checkYearMonth+standardSource
// composite unique), the proposals → users FKs (proposer/approver), and the
// payload_locked_documents_rels wiring Payload adds for every collection.
//
// Generated programmatically from the config diff (the payload CLI cannot load
// the config in this repo's local toolchain — see task-8-1a-report.md), then
// hand-scoped + given an IF-EXISTS-guarded `down` for a clean, idempotent
// round-trip (project convention — cf. task_8_1a_standardization).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_standardization_proposals_target" AS ENUM('domain', 'word', 'term');
  CREATE TYPE "public"."enum_standardization_proposals_proposal_kind" AS ENUM('register', 'edit', 'discard');
  CREATE TYPE "public"."enum_standardization_proposals_standard_source" AS ENUM('mois', 'institution');
  CREATE TYPE "public"."enum_standardization_proposals_approval_status" AS ENUM('approved', 'pending', 'rejected');
  CREATE TYPE "public"."enum_table_standard_settings_standard_source" AS ENUM('mois', 'institution', 'excluded', 'unassigned');
  CREATE TYPE "public"."enum_standardization_self_checks_standard_source" AS ENUM('mois', 'institution');
  CREATE TABLE "standardization_proposals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target" "enum_standardization_proposals_target" NOT NULL,
  	"proposal_kind" "enum_standardization_proposals_proposal_kind" NOT NULL,
  	"standard_source" "enum_standardization_proposals_standard_source" DEFAULT 'institution',
  	"revision" varchar,
  	"proposed_name" varchar NOT NULL,
  	"target_entry_id" numeric,
  	"proposed_payload" jsonb,
  	"proposer_id" integer,
  	"proposed_at" timestamp(3) with time zone,
  	"approval_status" "enum_standardization_proposals_approval_status" DEFAULT 'pending' NOT NULL,
  	"approver_id" integer,
  	"approved_at" timestamp(3) with time zone,
  	"processing_memo" varchar,
  	"applied_entry_id" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "table_standard_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"table_name" varchar NOT NULL,
  	"table_category" varchar DEFAULT '기본',
  	"table_description" varchar,
  	"standard_source" "enum_table_standard_settings_standard_source" DEFAULT 'unassigned' NOT NULL,
  	"physical_created_at" varchar,
  	"memo" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "standardization_self_checks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"check_year_month" varchar NOT NULL,
  	"standard_source" "enum_standardization_self_checks_standard_source" DEFAULT 'mois' NOT NULL,
  	"error1_count" numeric DEFAULT 0,
  	"error2_count" numeric DEFAULT 0,
  	"error3_count" numeric DEFAULT 0,
  	"error4_count" numeric DEFAULT 0,
  	"error5_count" numeric DEFAULT 0,
  	"error6_count" numeric DEFAULT 0,
  	"error7_count" numeric DEFAULT 0,
  	"error8_count" numeric DEFAULT 0,
  	"checked_at" timestamp(3) with time zone,
  	"details" jsonb,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "standardization_proposals_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "table_standard_settings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "standardization_self_checks_id" integer;
  ALTER TABLE "standardization_proposals" ADD CONSTRAINT "standardization_proposals_proposer_id_users_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "standardization_proposals" ADD CONSTRAINT "standardization_proposals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "standardization_proposals_proposer_idx" ON "standardization_proposals" USING btree ("proposer_id");
  CREATE INDEX "standardization_proposals_approver_idx" ON "standardization_proposals" USING btree ("approver_id");
  CREATE INDEX "standardization_proposals_updated_at_idx" ON "standardization_proposals" USING btree ("updated_at");
  CREATE INDEX "standardization_proposals_created_at_idx" ON "standardization_proposals" USING btree ("created_at");
  CREATE UNIQUE INDEX "table_standard_settings_table_name_idx" ON "table_standard_settings" USING btree ("table_name");
  CREATE INDEX "table_standard_settings_updated_at_idx" ON "table_standard_settings" USING btree ("updated_at");
  CREATE INDEX "table_standard_settings_created_at_idx" ON "table_standard_settings" USING btree ("created_at");
  CREATE INDEX "standardization_self_checks_check_year_month_idx" ON "standardization_self_checks" USING btree ("check_year_month");
  CREATE INDEX "standardization_self_checks_updated_at_idx" ON "standardization_self_checks" USING btree ("updated_at");
  CREATE INDEX "standardization_self_checks_created_at_idx" ON "standardization_self_checks" USING btree ("created_at");
  CREATE UNIQUE INDEX "checkYearMonth_standardSource_idx" ON "standardization_self_checks" USING btree ("check_year_month","standard_source");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_standardization_proposals_fk" FOREIGN KEY ("standardization_proposals_id") REFERENCES "public"."standardization_proposals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_table_standard_settings_fk" FOREIGN KEY ("table_standard_settings_id") REFERENCES "public"."table_standard_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_standardization_self_checks_fk" FOREIGN KEY ("standardization_self_checks_id") REFERENCES "public"."standardization_self_checks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_standardization_proposals__idx" ON "payload_locked_documents_rels" USING btree ("standardization_proposals_id");
  CREATE INDEX "payload_locked_documents_rels_table_standard_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("table_standard_settings_id");
  CREATE INDEX "payload_locked_documents_rels_standardization_self_check_idx" ON "payload_locked_documents_rels" USING btree ("standardization_self_checks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "standardization_proposals" CASCADE;
  DROP TABLE IF EXISTS "table_standard_settings" CASCADE;
  DROP TABLE IF EXISTS "standardization_self_checks" CASCADE;
  -- The DROP TABLE ... CASCADE above removes the FK constraints + indexes that
  -- reference these tables from payload_locked_documents_rels, so the explicit
  -- drops below must be IF-EXISTS for a clean, idempotent down round-trip.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_standardization_proposals_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_table_standard_settings_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_standardization_self_checks_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_standardization_proposals__idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_table_standard_settings_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_standardization_self_check_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "standardization_proposals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "table_standard_settings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "standardization_self_checks_id";
  DROP TYPE IF EXISTS "public"."enum_standardization_proposals_target";
  DROP TYPE IF EXISTS "public"."enum_standardization_proposals_proposal_kind";
  DROP TYPE IF EXISTS "public"."enum_standardization_proposals_standard_source";
  DROP TYPE IF EXISTS "public"."enum_standardization_proposals_approval_status";
  DROP TYPE IF EXISTS "public"."enum_table_standard_settings_standard_source";
  DROP TYPE IF EXISTS "public"."enum_standardization_self_checks_standard_source";`)
}
