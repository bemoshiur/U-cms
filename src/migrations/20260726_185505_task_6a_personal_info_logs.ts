import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_personal_info_access_logs_action" AS ENUM('view', 'edit', 'export');
  CREATE TYPE "public"."enum_personal_info_access_logs_purpose_category" AS ENUM('view', 'edit', 'export', 'inquiry_response', 'complaint_handling', 'other');
  CREATE TABLE "personal_info_access_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"screen" varchar,
  	"subject_label" varchar,
  	"subject_member_id" varchar,
  	"subject_site_id" varchar,
  	"url" varchar NOT NULL,
  	"action" "enum_personal_info_access_logs_action" NOT NULL,
  	"purpose_category" "enum_personal_info_access_logs_purpose_category" NOT NULL,
  	"purpose_detail" varchar,
  	"viewer_label" varchar,
  	"viewer_id" varchar,
  	"ip_address" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "personal_info_access_logs_id" integer;
  CREATE INDEX "personal_info_access_logs_occurred_at_idx" ON "personal_info_access_logs" USING btree ("occurred_at");
  CREATE INDEX "personal_info_access_logs_subject_member_id_idx" ON "personal_info_access_logs" USING btree ("subject_member_id");
  CREATE INDEX "personal_info_access_logs_action_idx" ON "personal_info_access_logs" USING btree ("action");
  CREATE INDEX "personal_info_access_logs_viewer_id_idx" ON "personal_info_access_logs" USING btree ("viewer_id");
  CREATE INDEX "personal_info_access_logs_updated_at_idx" ON "personal_info_access_logs" USING btree ("updated_at");
  CREATE INDEX "personal_info_access_logs_created_at_idx" ON "personal_info_access_logs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_personal_info_access_logs_fk" FOREIGN KEY ("personal_info_access_logs_id") REFERENCES "public"."personal_info_access_logs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_personal_info_access_logs__idx" ON "payload_locked_documents_rels" USING btree ("personal_info_access_logs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "personal_info_access_logs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "personal_info_access_logs" CASCADE;
  -- IF EXISTS: DROP TABLE ... CASCADE above already removes the FK constraint
  -- (and its index) on payload_locked_documents_rels that references the dropped
  -- table, so the explicit drops below must be idempotent for a clean down
  -- round-trip (Phase-2 D2 / Task 4E/5A/5C pattern).
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_personal_info_access_logs_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_personal_info_access_logs__idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "personal_info_access_logs_id";
  DROP TYPE IF EXISTS "public"."enum_personal_info_access_logs_action";
  DROP TYPE IF EXISTS "public"."enum_personal_info_access_logs_purpose_category";`)
}
