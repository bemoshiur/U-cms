import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_notification_areas_link_type" AS ENUM('internal', 'external');
  CREATE TYPE "public"."enum_popups_link_type" AS ENUM('internal', 'external');
  CREATE TYPE "public"."enum_banners_link_type" AS ENUM('internal', 'external');
  CREATE TYPE "public"."enum_admin_notices_notice_type" AS ENUM('pinned', 'general');
  CREATE TYPE "public"."enum_guide_menus_position" AS ENUM('top', 'bottom');
  CREATE TYPE "public"."enum_guide_menus_link_type" AS ENUM('internal', 'external');
  CREATE TABLE "notification_areas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"image_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"link_type" "enum_notification_areas_link_type" DEFAULT 'internal',
  	"link_internal" varchar,
  	"link_external" varchar,
  	"new_window" boolean DEFAULT false,
  	"active" boolean DEFAULT true,
  	"expose_from" timestamp(3) with time zone,
  	"expose_to" timestamp(3) with time zone,
  	"display_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "popups" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"image_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"link_type" "enum_popups_link_type" DEFAULT 'internal',
  	"link_internal" varchar,
  	"link_external" varchar,
  	"active" boolean DEFAULT true,
  	"expose_from" timestamp(3) with time zone,
  	"expose_to" timestamp(3) with time zone,
  	"width" numeric DEFAULT 400,
  	"height" numeric DEFAULT 300,
  	"top" numeric DEFAULT 100,
  	"left" numeric DEFAULT 100,
  	"show_scrollbar" boolean DEFAULT false,
  	"close_for_day" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "banners" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"image_id" integer NOT NULL,
  	"is_representative" boolean DEFAULT false,
  	"title" varchar NOT NULL,
  	"link_type" "enum_banners_link_type" DEFAULT 'internal',
  	"link_internal" varchar,
  	"link_external" varchar,
  	"new_window" boolean DEFAULT false,
  	"active" boolean DEFAULT true,
  	"expose_from" timestamp(3) with time zone,
  	"expose_to" timestamp(3) with time zone,
  	"display_order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "admin_notices_attachments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer NOT NULL,
  	"description" varchar
  );
  
  CREATE TABLE "admin_notices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"notice_type" "enum_admin_notices_notice_type" DEFAULT 'general' NOT NULL,
  	"pin_from" timestamp(3) with time zone,
  	"pin_to" timestamp(3) with time zone,
  	"title" varchar NOT NULL,
  	"department_id" integer,
  	"team" varchar,
  	"author" varchar,
  	"content" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "guide_menus" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"position" "enum_guide_menus_position" DEFAULT 'top' NOT NULL,
  	"name" varchar NOT NULL,
  	"link_type" "enum_guide_menus_link_type" DEFAULT 'internal',
  	"link_internal" varchar,
  	"link_external" varchar,
  	"new_window" boolean DEFAULT false,
  	"display_order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "notification_areas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "popups_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "banners_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "admin_notices_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "guide_menus_id" integer;
  ALTER TABLE "notification_areas" ADD CONSTRAINT "notification_areas_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_areas" ADD CONSTRAINT "notification_areas_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "popups" ADD CONSTRAINT "popups_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "popups" ADD CONSTRAINT "popups_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "banners" ADD CONSTRAINT "banners_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "banners" ADD CONSTRAINT "banners_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "admin_notices_attachments" ADD CONSTRAINT "admin_notices_attachments_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "admin_notices_attachments" ADD CONSTRAINT "admin_notices_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."admin_notices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admin_notices" ADD CONSTRAINT "admin_notices_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "admin_notices" ADD CONSTRAINT "admin_notices_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "guide_menus" ADD CONSTRAINT "guide_menus_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "notification_areas_tenant_idx" ON "notification_areas" USING btree ("tenant_id");
  CREATE INDEX "notification_areas_image_idx" ON "notification_areas" USING btree ("image_id");
  CREATE INDEX "notification_areas_updated_at_idx" ON "notification_areas" USING btree ("updated_at");
  CREATE INDEX "notification_areas_created_at_idx" ON "notification_areas" USING btree ("created_at");
  CREATE INDEX "popups_tenant_idx" ON "popups" USING btree ("tenant_id");
  CREATE INDEX "popups_image_idx" ON "popups" USING btree ("image_id");
  CREATE INDEX "popups_updated_at_idx" ON "popups" USING btree ("updated_at");
  CREATE INDEX "popups_created_at_idx" ON "popups" USING btree ("created_at");
  CREATE INDEX "banners_tenant_idx" ON "banners" USING btree ("tenant_id");
  CREATE INDEX "banners_image_idx" ON "banners" USING btree ("image_id");
  CREATE INDEX "banners_updated_at_idx" ON "banners" USING btree ("updated_at");
  CREATE INDEX "banners_created_at_idx" ON "banners" USING btree ("created_at");
  CREATE INDEX "admin_notices_attachments_order_idx" ON "admin_notices_attachments" USING btree ("_order");
  CREATE INDEX "admin_notices_attachments_parent_id_idx" ON "admin_notices_attachments" USING btree ("_parent_id");
  CREATE INDEX "admin_notices_attachments_media_idx" ON "admin_notices_attachments" USING btree ("media_id");
  CREATE INDEX "admin_notices_tenant_idx" ON "admin_notices" USING btree ("tenant_id");
  CREATE INDEX "admin_notices_department_idx" ON "admin_notices" USING btree ("department_id");
  CREATE INDEX "admin_notices_updated_at_idx" ON "admin_notices" USING btree ("updated_at");
  CREATE INDEX "admin_notices_created_at_idx" ON "admin_notices" USING btree ("created_at");
  CREATE INDEX "guide_menus_tenant_idx" ON "guide_menus" USING btree ("tenant_id");
  CREATE INDEX "guide_menus_updated_at_idx" ON "guide_menus" USING btree ("updated_at");
  CREATE INDEX "guide_menus_created_at_idx" ON "guide_menus" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notification_areas_fk" FOREIGN KEY ("notification_areas_id") REFERENCES "public"."notification_areas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_popups_fk" FOREIGN KEY ("popups_id") REFERENCES "public"."popups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_banners_fk" FOREIGN KEY ("banners_id") REFERENCES "public"."banners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admin_notices_fk" FOREIGN KEY ("admin_notices_id") REFERENCES "public"."admin_notices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_guide_menus_fk" FOREIGN KEY ("guide_menus_id") REFERENCES "public"."guide_menus"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_notification_areas_id_idx" ON "payload_locked_documents_rels" USING btree ("notification_areas_id");
  CREATE INDEX "payload_locked_documents_rels_popups_id_idx" ON "payload_locked_documents_rels" USING btree ("popups_id");
  CREATE INDEX "payload_locked_documents_rels_banners_id_idx" ON "payload_locked_documents_rels" USING btree ("banners_id");
  CREATE INDEX "payload_locked_documents_rels_admin_notices_id_idx" ON "payload_locked_documents_rels" USING btree ("admin_notices_id");
  CREATE INDEX "payload_locked_documents_rels_guide_menus_id_idx" ON "payload_locked_documents_rels" USING btree ("guide_menus_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // NOTE: `IF EXISTS` added by hand to the five `DROP CONSTRAINT` lines below
  // (same correction as the 1B/2A/2C/3A/3B down migrations). The preceding
  // `DROP TABLE ... CASCADE` statements already remove each table's
  // `payload_locked_documents_rels_*_fk` from the surviving
  // `payload_locked_documents_rels`, so the un-guarded explicit drops threw
  // `constraint ... does not exist` and broke migrate:down / refresh / reset.
  // Guarding makes the drops idempotent (and the whole down safe to re-run).
  await db.execute(sql`
   ALTER TABLE "notification_areas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "popups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "banners" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "admin_notices_attachments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "admin_notices" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "guide_menus" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "notification_areas" CASCADE;
  DROP TABLE "popups" CASCADE;
  DROP TABLE "banners" CASCADE;
  DROP TABLE "admin_notices_attachments" CASCADE;
  DROP TABLE "admin_notices" CASCADE;
  DROP TABLE "guide_menus" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_notification_areas_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_popups_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_banners_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_admin_notices_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_guide_menus_fk";

  DROP INDEX "payload_locked_documents_rels_notification_areas_id_idx";
  DROP INDEX "payload_locked_documents_rels_popups_id_idx";
  DROP INDEX "payload_locked_documents_rels_banners_id_idx";
  DROP INDEX "payload_locked_documents_rels_admin_notices_id_idx";
  DROP INDEX "payload_locked_documents_rels_guide_menus_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "notification_areas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "popups_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "banners_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "admin_notices_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "guide_menus_id";
  DROP TYPE "public"."enum_notification_areas_link_type";
  DROP TYPE "public"."enum_popups_link_type";
  DROP TYPE "public"."enum_banners_link_type";
  DROP TYPE "public"."enum_admin_notices_notice_type";
  DROP TYPE "public"."enum_guide_menus_position";
  DROP TYPE "public"."enum_guide_menus_link_type";`)
}
