import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Phase 8, Task 8.1a — Public-data Standardization dictionaries (refs
// 1-60..1-65). Adds three GLOBAL (non-tenant) collections — standardDomains /
// standardWords / standardTerms — with their select enums, the unique natural-key
// indexes (domain_name / abbreviation / term_abbreviation) the dictionary naming
// rules imply, the standardTerms → standardDomains FK (bound domain), and the
// payload_locked_documents_rels wiring Payload adds for every collection.
//
// Authored by hand from `payload createMigration` output (the CLI's config
// loader is broken in this repo's local toolchain — see task-8-1a-report.md),
// scoped to ONLY the 8.1a delta. `down` is fully IF-EXISTS guarded for a clean,
// idempotent round-trip (project convention — cf. task_5c_error_logs).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_standard_domains_standard_source" AS ENUM('mois', 'institution');
  CREATE TYPE "public"."enum_standard_domains_data_type" AS ENUM('NUMERIC', 'CHAR', 'VARCHAR', 'TEXT');
  CREATE TYPE "public"."enum_standard_domains_use_status" AS ENUM('used', 'unused');
  CREATE TYPE "public"."enum_standard_domains_approval_status" AS ENUM('approved', 'pending', 'rejected');
  CREATE TYPE "public"."enum_standard_words_standard_source" AS ENUM('mois', 'institution');
  CREATE TYPE "public"."enum_standard_words_use_status" AS ENUM('used', 'unused');
  CREATE TYPE "public"."enum_standard_words_approval_status" AS ENUM('approved', 'pending', 'rejected');
  CREATE TYPE "public"."enum_standard_terms_standard_source" AS ENUM('mois', 'institution');
  CREATE TYPE "public"."enum_standard_terms_use_status" AS ENUM('used', 'unused');
  CREATE TYPE "public"."enum_standard_terms_approval_status" AS ENUM('approved', 'pending', 'rejected');
  CREATE TABLE "standard_domains" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"standard_source" "enum_standard_domains_standard_source" DEFAULT 'institution' NOT NULL,
  	"revision" varchar,
  	"domain_group" varchar NOT NULL,
  	"classification" varchar NOT NULL,
  	"domain_name" varchar NOT NULL,
  	"data_type" "enum_standard_domains_data_type" NOT NULL,
  	"data_length" numeric,
  	"decimal_places" numeric,
  	"storage_format" varchar,
  	"display_format" varchar,
  	"unit_name" varchar,
  	"description" varchar,
  	"allowed_values" varchar,
  	"memo" varchar,
  	"use_status" "enum_standard_domains_use_status" DEFAULT 'used' NOT NULL,
  	"approval_status" "enum_standard_domains_approval_status" DEFAULT 'pending',
  	"approved_at" timestamp(3) with time zone,
  	"approver_id" varchar,
  	"enacted" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "standard_words" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"standard_source" "enum_standard_words_standard_source" DEFAULT 'institution' NOT NULL,
  	"revision" varchar,
  	"abbreviation" varchar NOT NULL,
  	"korean_name" varchar NOT NULL,
  	"english_name" varchar NOT NULL,
  	"is_formal_word" boolean DEFAULT false,
  	"domain_classification" varchar,
  	"synonyms" varchar,
  	"forbidden_words" varchar,
  	"description" varchar,
  	"memo" varchar,
  	"use_status" "enum_standard_words_use_status" DEFAULT 'used' NOT NULL,
  	"approval_status" "enum_standard_words_approval_status" DEFAULT 'pending',
  	"approved_at" timestamp(3) with time zone,
  	"approver_id" varchar,
  	"enacted" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "standard_terms" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"standard_source" "enum_standard_terms_standard_source" DEFAULT 'institution' NOT NULL,
  	"revision" varchar,
  	"term_abbreviation" varchar NOT NULL,
  	"term_name" varchar NOT NULL,
  	"bound_domain_id" integer,
  	"allowed_values" varchar,
  	"storage_format" varchar,
  	"display_format" varchar,
  	"term_description" varchar,
  	"standard_admin_code_name" varchar,
  	"competent_agency" varchar,
  	"synonyms" varchar,
  	"memo" varchar,
  	"use_status" "enum_standard_terms_use_status" DEFAULT 'used' NOT NULL,
  	"approval_status" "enum_standard_terms_approval_status" DEFAULT 'pending',
  	"approved_at" timestamp(3) with time zone,
  	"approver_id" varchar,
  	"enacted" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "standard_domains_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "standard_words_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "standard_terms_id" integer;
  ALTER TABLE "standard_terms" ADD CONSTRAINT "standard_terms_bound_domain_id_standard_domains_id_fk" FOREIGN KEY ("bound_domain_id") REFERENCES "public"."standard_domains"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "standard_domains_domain_name_idx" ON "standard_domains" USING btree ("domain_name");
  CREATE INDEX "standard_domains_updated_at_idx" ON "standard_domains" USING btree ("updated_at");
  CREATE INDEX "standard_domains_created_at_idx" ON "standard_domains" USING btree ("created_at");
  CREATE UNIQUE INDEX "standard_words_abbreviation_idx" ON "standard_words" USING btree ("abbreviation");
  CREATE INDEX "standard_words_updated_at_idx" ON "standard_words" USING btree ("updated_at");
  CREATE INDEX "standard_words_created_at_idx" ON "standard_words" USING btree ("created_at");
  CREATE UNIQUE INDEX "standard_terms_term_abbreviation_idx" ON "standard_terms" USING btree ("term_abbreviation");
  CREATE INDEX "standard_terms_bound_domain_idx" ON "standard_terms" USING btree ("bound_domain_id");
  CREATE INDEX "standard_terms_updated_at_idx" ON "standard_terms" USING btree ("updated_at");
  CREATE INDEX "standard_terms_created_at_idx" ON "standard_terms" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_standard_domains_fk" FOREIGN KEY ("standard_domains_id") REFERENCES "public"."standard_domains"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_standard_words_fk" FOREIGN KEY ("standard_words_id") REFERENCES "public"."standard_words"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_standard_terms_fk" FOREIGN KEY ("standard_terms_id") REFERENCES "public"."standard_terms"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_standard_domains_id_idx" ON "payload_locked_documents_rels" USING btree ("standard_domains_id");
  CREATE INDEX "payload_locked_documents_rels_standard_words_id_idx" ON "payload_locked_documents_rels" USING btree ("standard_words_id");
  CREATE INDEX "payload_locked_documents_rels_standard_terms_id_idx" ON "payload_locked_documents_rels" USING btree ("standard_terms_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "standard_terms" CASCADE;
  DROP TABLE IF EXISTS "standard_words" CASCADE;
  DROP TABLE IF EXISTS "standard_domains" CASCADE;
  -- The DROP TABLE ... CASCADE above removes the FK constraints + indexes that
  -- reference these tables from payload_locked_documents_rels, so the explicit
  -- drops below must be IF-EXISTS for a clean, idempotent down round-trip.
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_standard_domains_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_standard_words_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_standard_terms_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_standard_domains_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_standard_words_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_standard_terms_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "standard_domains_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "standard_words_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "standard_terms_id";
  DROP TYPE IF EXISTS "public"."enum_standard_domains_standard_source";
  DROP TYPE IF EXISTS "public"."enum_standard_domains_data_type";
  DROP TYPE IF EXISTS "public"."enum_standard_domains_use_status";
  DROP TYPE IF EXISTS "public"."enum_standard_domains_approval_status";
  DROP TYPE IF EXISTS "public"."enum_standard_words_standard_source";
  DROP TYPE IF EXISTS "public"."enum_standard_words_use_status";
  DROP TYPE IF EXISTS "public"."enum_standard_words_approval_status";
  DROP TYPE IF EXISTS "public"."enum_standard_terms_standard_source";
  DROP TYPE IF EXISTS "public"."enum_standard_terms_use_status";
  DROP TYPE IF EXISTS "public"."enum_standard_terms_approval_status";`)
}
