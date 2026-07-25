import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_status" AS ENUM('pending', 'active', 'dormant', 'locked');
  CREATE TABLE "password_policies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"rule_text" varchar NOT NULL,
  	"is_active" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "login_id" varchar;
  ALTER TABLE "users" ADD COLUMN "status" "enum_users_status" DEFAULT 'pending' NOT NULL;
  ALTER TABLE "users" ADD COLUMN "department_id" integer;
  ALTER TABLE "users" ADD COLUMN "duties" varchar;
  ALTER TABLE "users" ADD COLUMN "mobile" varchar;
  ALTER TABLE "users" ADD COLUMN "extension" varchar;
  ALTER TABLE "users" ADD COLUMN "profile_photo_id" integer;
  ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "password_policies_id" integer;
  CREATE INDEX "password_policies_updated_at_idx" ON "password_policies" USING btree ("updated_at");
  CREATE INDEX "password_policies_created_at_idx" ON "password_policies" USING btree ("created_at");
  ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users" ADD CONSTRAINT "users_profile_photo_id_media_id_fk" FOREIGN KEY ("profile_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_password_policies_fk" FOREIGN KEY ("password_policies_id") REFERENCES "public"."password_policies"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "users_login_id_idx" ON "users" USING btree ("login_id");
  CREATE INDEX "users_department_idx" ON "users" USING btree ("department_id");
  CREATE INDEX "users_profile_photo_idx" ON "users" USING btree ("profile_photo_id");
  CREATE INDEX "payload_locked_documents_rels_password_policies_id_idx" ON "payload_locked_documents_rels" USING btree ("password_policies_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // NOTE: `IF EXISTS` added by hand to the `DROP CONSTRAINT` lines below (same
  // correction as the 2A/2C down migrations). The preceding
  // `DROP TABLE "password_policies" CASCADE` already removes
  // `payload_locked_documents_rels_password_policies_fk` from the surviving
  // `payload_locked_documents_rels`, so the un-guarded explicit drop threw
  // `constraint ... does not exist` and broke migrate:down / refresh / reset.
  // Guarding makes the drops idempotent (and the whole down safe to re-run).
  await db.execute(sql`
   ALTER TABLE "password_policies" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "password_policies" CASCADE;
  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_department_id_departments_id_fk";

  ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_profile_photo_id_media_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_password_policies_fk";

  DROP INDEX "users_login_id_idx";
  DROP INDEX "users_department_idx";
  DROP INDEX "users_profile_photo_idx";
  DROP INDEX "payload_locked_documents_rels_password_policies_id_idx";
  ALTER TABLE "users" DROP COLUMN "login_id";
  ALTER TABLE "users" DROP COLUMN "status";
  ALTER TABLE "users" DROP COLUMN "department_id";
  ALTER TABLE "users" DROP COLUMN "duties";
  ALTER TABLE "users" DROP COLUMN "mobile";
  ALTER TABLE "users" DROP COLUMN "extension";
  ALTER TABLE "users" DROP COLUMN "profile_photo_id";
  ALTER TABLE "users" DROP COLUMN "last_login_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "password_policies_id";
  DROP TYPE "public"."enum_users_status";`)
}
