import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_members_terms_consents_category" AS ENUM('service', 'privacy');
  CREATE TYPE "public"."enum_members_status" AS ENUM('active', 'pending', 'dormant', 'withdrawn');
  CREATE TABLE "members_terms_consents" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"category" "enum_members_terms_consents_category" NOT NULL,
  	"version" varchar NOT NULL,
  	"agreed_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "members" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"login_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"mobile" varchar,
  	"status" "enum_members_status" DEFAULT 'active' NOT NULL,
  	"tenant_id" integer NOT NULL,
  	"marketing_consent" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  ALTER TABLE "sites" ADD COLUMN "member_approval_required" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "members_id" integer;
  ALTER TABLE "members_terms_consents" ADD CONSTRAINT "members_terms_consents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "members" ADD CONSTRAINT "members_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "members_terms_consents_order_idx" ON "members_terms_consents" USING btree ("_order");
  CREATE INDEX "members_terms_consents_parent_id_idx" ON "members_terms_consents" USING btree ("_parent_id");
  CREATE INDEX "members_tenant_idx" ON "members" USING btree ("tenant_id");
  CREATE INDEX "members_updated_at_idx" ON "members" USING btree ("updated_at");
  CREATE INDEX "members_created_at_idx" ON "members" USING btree ("created_at");
  CREATE UNIQUE INDEX "members_email_idx" ON "members" USING btree ("email");
  CREATE UNIQUE INDEX "tenant_loginId_idx" ON "members" USING btree ("tenant_id","login_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_members_fk" FOREIGN KEY ("members_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_members_id_idx" ON "payload_locked_documents_rels" USING btree ("members_id");
  CREATE INDEX "payload_preferences_rels_members_id_idx" ON "payload_preferences_rels" USING btree ("members_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "members_terms_consents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "members" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "members_terms_consents" CASCADE;
  DROP TABLE "members" CASCADE;
  -- IF EXISTS: DROP TABLE "members" CASCADE above already removes any FK
  -- constraints on other tables that reference members, so these explicit drops
  -- must be idempotent for a clean down round-trip (Phase-2 D2 pattern).
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_members_fk";

  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_members_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_members_id_idx";
  DROP INDEX IF EXISTS "payload_preferences_rels_members_id_idx";
  ALTER TABLE "sites" DROP COLUMN "member_approval_required";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "members_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "members_id";
  DROP TYPE "public"."enum_members_terms_consents_category";
  DROP TYPE "public"."enum_members_status";`)
}
