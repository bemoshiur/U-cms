import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_menus_content_type" AS ENUM('placeholder', 'program', 'board', 'content', 'link');
  CREATE TYPE "public"."enum_menus_exposure_condition" AS ENUM('always', 'loggedInOnly', 'loggedOutOnly');
  CREATE TYPE "public"."enum_web_contents_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__web_contents_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_help_entries_bind_type" AS ENUM('service', 'menu');
  CREATE TABLE "menus" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"menu_number" numeric,
  	"parent_id" integer,
  	"order" numeric DEFAULT 0,
  	"content_type" "enum_menus_content_type" DEFAULT 'placeholder',
  	"board_id" integer,
  	"link_url" varchar,
  	"new_window" boolean DEFAULT false,
  	"active" boolean DEFAULT true,
  	"exposure_condition" "enum_menus_exposure_condition" DEFAULT 'always',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "menus_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"departments_id" integer
  );
  
  CREATE TABLE "web_contents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"menu_id" integer,
  	"name" varchar,
  	"title" varchar,
  	"content" jsonb,
  	"responsible_dept_id" integer,
  	"responsible_person" varchar,
  	"content_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_web_contents_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_web_contents_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_tenant_id" integer,
  	"version_menu_id" integer,
  	"version_name" varchar,
  	"version_title" varchar,
  	"version_content" jsonb,
  	"version_responsible_dept_id" integer,
  	"version_responsible_person" varchar,
  	"version_content_url" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__web_contents_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "short_urls" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"link_name" varchar NOT NULL,
  	"original_url" varchar NOT NULL,
  	"remarks" varchar,
  	"code" varchar,
  	"hit_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "help_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"parent_id" integer,
  	"order" numeric DEFAULT 0,
  	"content" jsonb,
  	"bind_type" "enum_help_entries_bind_type" DEFAULT 'service',
  	"url_pattern" varchar,
  	"menu_number" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "menus_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "web_contents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "short_urls_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "help_entries_id" integer;
  ALTER TABLE "menus" ADD CONSTRAINT "menus_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "menus" ADD CONSTRAINT "menus_parent_id_menus_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "menus" ADD CONSTRAINT "menus_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "menus_rels" ADD CONSTRAINT "menus_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_rels" ADD CONSTRAINT "menus_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_rels" ADD CONSTRAINT "menus_rels_departments_fk" FOREIGN KEY ("departments_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "web_contents" ADD CONSTRAINT "web_contents_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "web_contents" ADD CONSTRAINT "web_contents_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "web_contents" ADD CONSTRAINT "web_contents_responsible_dept_id_departments_id_fk" FOREIGN KEY ("responsible_dept_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_web_contents_v" ADD CONSTRAINT "_web_contents_v_parent_id_web_contents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."web_contents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_web_contents_v" ADD CONSTRAINT "_web_contents_v_version_tenant_id_sites_id_fk" FOREIGN KEY ("version_tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_web_contents_v" ADD CONSTRAINT "_web_contents_v_version_menu_id_menus_id_fk" FOREIGN KEY ("version_menu_id") REFERENCES "public"."menus"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_web_contents_v" ADD CONSTRAINT "_web_contents_v_version_responsible_dept_id_departments_id_fk" FOREIGN KEY ("version_responsible_dept_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "short_urls" ADD CONSTRAINT "short_urls_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "help_entries" ADD CONSTRAINT "help_entries_parent_id_help_entries_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."help_entries"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "menus_tenant_idx" ON "menus" USING btree ("tenant_id");
  CREATE INDEX "menus_parent_idx" ON "menus" USING btree ("parent_id");
  CREATE INDEX "menus_board_idx" ON "menus" USING btree ("board_id");
  CREATE INDEX "menus_updated_at_idx" ON "menus" USING btree ("updated_at");
  CREATE INDEX "menus_created_at_idx" ON "menus" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenant_menuNumber_idx" ON "menus" USING btree ("tenant_id","menu_number");
  CREATE INDEX "menus_rels_order_idx" ON "menus_rels" USING btree ("order");
  CREATE INDEX "menus_rels_parent_idx" ON "menus_rels" USING btree ("parent_id");
  CREATE INDEX "menus_rels_path_idx" ON "menus_rels" USING btree ("path");
  CREATE INDEX "menus_rels_users_id_idx" ON "menus_rels" USING btree ("users_id");
  CREATE INDEX "menus_rels_departments_id_idx" ON "menus_rels" USING btree ("departments_id");
  CREATE INDEX "web_contents_tenant_idx" ON "web_contents" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "web_contents_menu_idx" ON "web_contents" USING btree ("menu_id");
  CREATE INDEX "web_contents_responsible_dept_idx" ON "web_contents" USING btree ("responsible_dept_id");
  CREATE INDEX "web_contents_updated_at_idx" ON "web_contents" USING btree ("updated_at");
  CREATE INDEX "web_contents_created_at_idx" ON "web_contents" USING btree ("created_at");
  CREATE INDEX "web_contents__status_idx" ON "web_contents" USING btree ("_status");
  CREATE INDEX "_web_contents_v_parent_idx" ON "_web_contents_v" USING btree ("parent_id");
  CREATE INDEX "_web_contents_v_version_version_tenant_idx" ON "_web_contents_v" USING btree ("version_tenant_id");
  CREATE INDEX "_web_contents_v_version_version_menu_idx" ON "_web_contents_v" USING btree ("version_menu_id");
  CREATE INDEX "_web_contents_v_version_version_responsible_dept_idx" ON "_web_contents_v" USING btree ("version_responsible_dept_id");
  CREATE INDEX "_web_contents_v_version_version_updated_at_idx" ON "_web_contents_v" USING btree ("version_updated_at");
  CREATE INDEX "_web_contents_v_version_version_created_at_idx" ON "_web_contents_v" USING btree ("version_created_at");
  CREATE INDEX "_web_contents_v_version_version__status_idx" ON "_web_contents_v" USING btree ("version__status");
  CREATE INDEX "_web_contents_v_created_at_idx" ON "_web_contents_v" USING btree ("created_at");
  CREATE INDEX "_web_contents_v_updated_at_idx" ON "_web_contents_v" USING btree ("updated_at");
  CREATE INDEX "_web_contents_v_latest_idx" ON "_web_contents_v" USING btree ("latest");
  CREATE INDEX "short_urls_tenant_idx" ON "short_urls" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "short_urls_code_idx" ON "short_urls" USING btree ("code");
  CREATE INDEX "short_urls_updated_at_idx" ON "short_urls" USING btree ("updated_at");
  CREATE INDEX "short_urls_created_at_idx" ON "short_urls" USING btree ("created_at");
  CREATE INDEX "help_entries_parent_idx" ON "help_entries" USING btree ("parent_id");
  CREATE INDEX "help_entries_updated_at_idx" ON "help_entries" USING btree ("updated_at");
  CREATE INDEX "help_entries_created_at_idx" ON "help_entries" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menus_fk" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_web_contents_fk" FOREIGN KEY ("web_contents_id") REFERENCES "public"."web_contents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_short_urls_fk" FOREIGN KEY ("short_urls_id") REFERENCES "public"."short_urls"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_help_entries_fk" FOREIGN KEY ("help_entries_id") REFERENCES "public"."help_entries"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_menus_id_idx" ON "payload_locked_documents_rels" USING btree ("menus_id");
  CREATE INDEX "payload_locked_documents_rels_web_contents_id_idx" ON "payload_locked_documents_rels" USING btree ("web_contents_id");
  CREATE INDEX "payload_locked_documents_rels_short_urls_id_idx" ON "payload_locked_documents_rels" USING btree ("short_urls_id");
  CREATE INDEX "payload_locked_documents_rels_help_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("help_entries_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // NOTE: `IF EXISTS` added by hand to the four `DROP CONSTRAINT` lines below
  // (same correction as the 1B/2A/2C/3A/3B/3C down migrations). The preceding
  // `DROP TABLE ... CASCADE` statements already remove each table's
  // `payload_locked_documents_rels_*_fk` from the surviving
  // `payload_locked_documents_rels`, so the un-guarded explicit drops threw
  // `constraint ... does not exist` and broke migrate:down / refresh / reset.
  // Guarding makes the drops idempotent (and the whole down safe to re-run).
  await db.execute(sql`
   ALTER TABLE "menus" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "menus_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "web_contents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_web_contents_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "short_urls" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "help_entries" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "menus" CASCADE;
  DROP TABLE "menus_rels" CASCADE;
  DROP TABLE "web_contents" CASCADE;
  DROP TABLE "_web_contents_v" CASCADE;
  DROP TABLE "short_urls" CASCADE;
  DROP TABLE "help_entries" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_menus_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_web_contents_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_short_urls_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_help_entries_fk";

  DROP INDEX "payload_locked_documents_rels_menus_id_idx";
  DROP INDEX "payload_locked_documents_rels_web_contents_id_idx";
  DROP INDEX "payload_locked_documents_rels_short_urls_id_idx";
  DROP INDEX "payload_locked_documents_rels_help_entries_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "menus_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "web_contents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "short_urls_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "help_entries_id";
  DROP TYPE "public"."enum_menus_content_type";
  DROP TYPE "public"."enum_menus_exposure_condition";
  DROP TYPE "public"."enum_web_contents_status";
  DROP TYPE "public"."enum__web_contents_v_version_status";
  DROP TYPE "public"."enum_help_entries_bind_type";`)
}
