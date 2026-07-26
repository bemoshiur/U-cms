import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "error_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"occurred_at" timestamp(3) with time zone NOT NULL,
  	"exception_class" varchar,
  	"message" varchar,
  	"url" varchar,
  	"http_method" varchar,
  	"status_code" numeric,
  	"actor_label" varchar,
  	"actor_id" varchar,
  	"ip_address" varchar,
  	"stack_digest" varchar,
  	"user_agent_family" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "error_logs_id" integer;
  CREATE INDEX "error_logs_occurred_at_idx" ON "error_logs" USING btree ("occurred_at");
  CREATE INDEX "error_logs_exception_class_idx" ON "error_logs" USING btree ("exception_class");
  CREATE INDEX "error_logs_url_idx" ON "error_logs" USING btree ("url");
  CREATE INDEX "error_logs_status_code_idx" ON "error_logs" USING btree ("status_code");
  CREATE INDEX "error_logs_updated_at_idx" ON "error_logs" USING btree ("updated_at");
  CREATE INDEX "error_logs_created_at_idx" ON "error_logs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_error_logs_fk" FOREIGN KEY ("error_logs_id") REFERENCES "public"."error_logs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_error_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("error_logs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "error_logs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "error_logs" CASCADE;
  -- IF EXISTS: the DROP TABLE ... CASCADE above already removes the FK constraint
  -- (and its index) on payload_locked_documents_rels that references the dropped
  -- table, so the explicit drops below must be idempotent for a clean down
  -- round-trip (Phase-2 D2 / Task 4E/5A pattern).
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_error_logs_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_error_logs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "error_logs_id";`)
}
