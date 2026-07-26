import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_terms_documents_category" AS ENUM('termsOfUse', 'personalInfoProcessing', 'thirdPartyProvision', 'uniqueIdCollection', 'other');
  CREATE TYPE "public"."enum_terms_documents_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__terms_documents_v_version_category" AS ENUM('termsOfUse', 'personalInfoProcessing', 'thirdPartyProvision', 'uniqueIdCollection', 'other');
  CREATE TYPE "public"."enum__terms_documents_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_page_views_device_type" AS ENUM('mobile', 'desktop');
  CREATE TABLE "terms_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"category" "enum_terms_documents_category",
  	"menu_id" integer,
  	"title" varchar,
  	"content" jsonb,
  	"effective_date" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_terms_documents_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_terms_documents_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_category" "enum__terms_documents_v_version_category",
  	"version_menu_id" integer,
  	"version_title" varchar,
  	"version_content" jsonb,
  	"version_effective_date" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__terms_documents_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "satisfaction_ratings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"menu_id" integer,
  	"page_key" varchar NOT NULL,
  	"score" numeric NOT NULL,
  	"member_id" integer,
  	"submitted_at" timestamp(3) with time zone,
  	"ip_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "page_views" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"path" varchar NOT NULL,
  	"menu_id" integer,
  	"device_type" "enum_page_views_device_type",
  	"referrer_host" varchar,
  	"session_key" varchar,
  	"ts" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "terms_documents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "satisfaction_ratings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "page_views_id" integer;
  ALTER TABLE "terms_documents" ADD CONSTRAINT "terms_documents_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "terms_documents" ADD CONSTRAINT "terms_documents_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_terms_documents_v" ADD CONSTRAINT "_terms_documents_v_parent_id_terms_documents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."terms_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_terms_documents_v" ADD CONSTRAINT "_terms_documents_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_terms_documents_v" ADD CONSTRAINT "_terms_documents_v_version_menu_id_menus_id_fk" FOREIGN KEY ("version_menu_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "satisfaction_ratings" ADD CONSTRAINT "satisfaction_ratings_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "satisfaction_ratings" ADD CONSTRAINT "satisfaction_ratings_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "satisfaction_ratings" ADD CONSTRAINT "satisfaction_ratings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_views" ADD CONSTRAINT "page_views_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_views" ADD CONSTRAINT "page_views_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "terms_documents_tenant_idx" ON "terms_documents" USING btree ("tenant_id");
  CREATE INDEX "terms_documents_menu_idx" ON "terms_documents" USING btree ("menu_id");
  CREATE INDEX "terms_documents_updated_at_idx" ON "terms_documents" USING btree ("updated_at");
  CREATE INDEX "terms_documents_created_at_idx" ON "terms_documents" USING btree ("created_at");
  CREATE INDEX "terms_documents__status_idx" ON "terms_documents" USING btree ("_status");
  CREATE UNIQUE INDEX "tenant_category_idx" ON "terms_documents" USING btree ("tenant_id","category");
  CREATE INDEX "_terms_documents_v_parent_idx" ON "_terms_documents_v" USING btree ("parent_id");
  CREATE INDEX "_terms_documents_v_version_version_tenant_idx" ON "_terms_documents_v" USING btree ("version_tenant_id");
  CREATE INDEX "_terms_documents_v_version_version_menu_idx" ON "_terms_documents_v" USING btree ("version_menu_id");
  CREATE INDEX "_terms_documents_v_version_version_updated_at_idx" ON "_terms_documents_v" USING btree ("version_updated_at");
  CREATE INDEX "_terms_documents_v_version_version_created_at_idx" ON "_terms_documents_v" USING btree ("version_created_at");
  CREATE INDEX "_terms_documents_v_version_version__status_idx" ON "_terms_documents_v" USING btree ("version__status");
  CREATE INDEX "_terms_documents_v_created_at_idx" ON "_terms_documents_v" USING btree ("created_at");
  CREATE INDEX "_terms_documents_v_updated_at_idx" ON "_terms_documents_v" USING btree ("updated_at");
  CREATE INDEX "_terms_documents_v_latest_idx" ON "_terms_documents_v" USING btree ("latest");
  CREATE INDEX "version_tenant_version_category_idx" ON "_terms_documents_v" USING btree ("version_tenant_id","version_category");
  CREATE INDEX "satisfaction_ratings_tenant_idx" ON "satisfaction_ratings" USING btree ("tenant_id");
  CREATE INDEX "satisfaction_ratings_menu_idx" ON "satisfaction_ratings" USING btree ("menu_id");
  CREATE INDEX "satisfaction_ratings_member_idx" ON "satisfaction_ratings" USING btree ("member_id");
  CREATE INDEX "satisfaction_ratings_updated_at_idx" ON "satisfaction_ratings" USING btree ("updated_at");
  CREATE INDEX "satisfaction_ratings_created_at_idx" ON "satisfaction_ratings" USING btree ("created_at");
  CREATE INDEX "page_views_tenant_idx" ON "page_views" USING btree ("tenant_id");
  CREATE INDEX "page_views_menu_idx" ON "page_views" USING btree ("menu_id");
  CREATE INDEX "page_views_updated_at_idx" ON "page_views" USING btree ("updated_at");
  CREATE INDEX "page_views_created_at_idx" ON "page_views" USING btree ("created_at");
  CREATE INDEX "tenant_ts_idx" ON "page_views" USING btree ("tenant_id","ts");
  CREATE INDEX "tenant_menu_idx" ON "page_views" USING btree ("tenant_id","menu_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_terms_documents_fk" FOREIGN KEY ("terms_documents_id") REFERENCES "public"."terms_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_satisfaction_ratings_fk" FOREIGN KEY ("satisfaction_ratings_id") REFERENCES "public"."satisfaction_ratings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_views_fk" FOREIGN KEY ("page_views_id") REFERENCES "public"."page_views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_terms_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("terms_documents_id");
  CREATE INDEX "payload_locked_documents_rels_satisfaction_ratings_id_idx" ON "payload_locked_documents_rels" USING btree ("satisfaction_ratings_id");
  CREATE INDEX "payload_locked_documents_rels_page_views_id_idx" ON "payload_locked_documents_rels" USING btree ("page_views_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "terms_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_terms_documents_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "satisfaction_ratings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "page_views" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "terms_documents" CASCADE;
  DROP TABLE "_terms_documents_v" CASCADE;
  DROP TABLE "satisfaction_ratings" CASCADE;
  DROP TABLE "page_views" CASCADE;
  -- IF EXISTS: the DROP TABLE ... CASCADE statements above already remove any FK
  -- constraints on payload_locked_documents_rels that reference the dropped
  -- tables, so these explicit drops must be idempotent for a clean down
  -- round-trip (Phase-2 D2 / Task 4B members-migration pattern).
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_terms_documents_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_satisfaction_ratings_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_page_views_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_terms_documents_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_satisfaction_ratings_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_page_views_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "terms_documents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "satisfaction_ratings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "page_views_id";
  DROP TYPE IF EXISTS "public"."enum_terms_documents_category";
  DROP TYPE IF EXISTS "public"."enum_terms_documents_status";
  DROP TYPE IF EXISTS "public"."enum__terms_documents_v_version_category";
  DROP TYPE IF EXISTS "public"."enum__terms_documents_v_version_status";
  DROP TYPE IF EXISTS "public"."enum_page_views_device_type";`)
}
