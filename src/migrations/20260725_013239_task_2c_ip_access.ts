import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_admin_ip_rules_access_type" AS ENUM('allow', 'block');
  ALTER TYPE "public"."enum_access_logs_action" ADD VALUE 'denied';
  CREATE TABLE "admin_ip_rules" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"applicant_name" varchar NOT NULL,
  	"affiliation" varchar NOT NULL,
  	"phone" varchar NOT NULL,
  	"memo" varchar,
  	"ip_address" varchar NOT NULL,
  	"access_type" "enum_admin_ip_rules_access_type" DEFAULT 'allow' NOT NULL,
  	"valid_from" timestamp(3) with time zone NOT NULL,
  	"valid_to" timestamp(3) with time zone NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"site_id_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "admin_ip_rules_id" integer;
  ALTER TABLE "admin_ip_rules" ADD CONSTRAINT "admin_ip_rules_site_id_id_sites_id_fk" FOREIGN KEY ("site_id_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "admin_ip_rules_site_id_idx" ON "admin_ip_rules" USING btree ("site_id_id");
  CREATE INDEX "admin_ip_rules_updated_at_idx" ON "admin_ip_rules" USING btree ("updated_at");
  CREATE INDEX "admin_ip_rules_created_at_idx" ON "admin_ip_rules" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admin_ip_rules_fk" FOREIGN KEY ("admin_ip_rules_id") REFERENCES "public"."admin_ip_rules"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_admin_ip_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("admin_ip_rules_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // NOTE: the ordering below is corrected by hand from the generated output.
  // Payload emitted `DROP TABLE admin_ip_rules CASCADE` *before* dropping the
  // `payload_locked_documents_rels` FK that references it — but CASCADE already
  // removes that FK, so the later explicit DROP CONSTRAINT threw. We drop the
  // referencing column/constraint/index first, then the table, with IF EXISTS
  // guards so the down is safe to re-run.
  //
  // The access_logs.action revert casts the column back to an enum WITHOUT
  // 'denied'; any pre-existing `denied` rows are collapsed to 'view' so the
  // cast cannot fail on a rollback.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_admin_ip_rules_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_admin_ip_rules_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "admin_ip_rules_id";
  DROP TABLE IF EXISTS "admin_ip_rules" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_admin_ip_rules_access_type";

  UPDATE "access_logs" SET "action" = 'view' WHERE "action" = 'denied';
  ALTER TABLE "access_logs" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_access_logs_action";
  CREATE TYPE "public"."enum_access_logs_action" AS ENUM('login', 'logout', 'list', 'view', 'create', 'update', 'delete');
  ALTER TABLE "access_logs" ALTER COLUMN "action" SET DATA TYPE "public"."enum_access_logs_action" USING "action"::"public"."enum_access_logs_action";`)
}
