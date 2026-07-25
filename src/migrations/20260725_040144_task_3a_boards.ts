import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_board_types_kind" AS ENUM('integrated', 'photo', 'qna', 'faq', 'attachment', 'extended');
  CREATE TYPE "public"."enum_boards_fields_input_type" AS ENUM('text', 'textarea', 'date', 'email', 'select', 'number');
  CREATE TYPE "public"."enum_boards_skin" AS ENUM('common', 'site');
  CREATE TYPE "public"."enum_boards_board_form" AS ENUM('list', 'thumbnail');
  CREATE TYPE "public"."enum_boards_sort_order" AS ENUM('latest', 'oldest');
  CREATE TABLE "board_types" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar,
  	"name" varchar NOT NULL,
  	"kind" "enum_board_types_kind" NOT NULL,
  	"table_name" varchar DEFAULT 'posts',
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "boards_categories" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"classification_code_id" integer NOT NULL,
  	"title" varchar,
  	"html_title_attr" varchar,
  	"attribute_value" varchar,
  	"style" varchar,
  	"use_flag" boolean DEFAULT false,
  	"required_flag" boolean DEFAULT false,
  	"list_flag" boolean DEFAULT false,
  	"detail_flag" boolean DEFAULT false,
  	"search_flag" boolean DEFAULT false
  );
  
  CREATE TABLE "boards_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"field_key" varchar NOT NULL,
  	"label" varchar,
  	"html_title_attr" varchar,
  	"attribute_value" varchar,
  	"style" varchar,
  	"input_type" "enum_boards_fields_input_type" DEFAULT 'text',
  	"use_flag" boolean DEFAULT false,
  	"required_flag" boolean DEFAULT false,
  	"list_flag" boolean DEFAULT false,
  	"detail_flag" boolean DEFAULT false,
  	"search_flag" boolean DEFAULT false
  );
  
  CREATE TABLE "boards" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"bbs_id" varchar,
  	"name" varchar NOT NULL,
  	"board_type_id" integer NOT NULL,
  	"is_integrated" boolean DEFAULT false,
  	"skin" "enum_boards_skin" DEFAULT 'common',
  	"board_form" "enum_boards_board_form" DEFAULT 'list',
  	"sort_order" "enum_boards_sort_order" DEFAULT 'latest',
  	"editor_for_admin_only" boolean DEFAULT true,
  	"comments_enabled" boolean DEFAULT false,
  	"prev_next_enabled" boolean DEFAULT false,
  	"excel_export" boolean DEFAULT false,
  	"user_post_allowed" boolean DEFAULT false,
  	"secret_post_allowed" boolean DEFAULT false,
  	"new_icon_window" numeric DEFAULT 3,
  	"list_count" numeric DEFAULT 10,
  	"page_count" numeric DEFAULT 10,
  	"top_content" varchar,
  	"bottom_content" varchar,
  	"header_notice" varchar,
  	"attachments_enabled" boolean DEFAULT false,
  	"attachment_max_count" numeric DEFAULT 1,
  	"attachment_max_size_m_b" numeric DEFAULT 10,
  	"attachment_allowed_extensions" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "boards_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "board_types_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "boards_id" integer;
  ALTER TABLE "boards_categories" ADD CONSTRAINT "boards_categories_classification_code_id_code_groups_id_fk" FOREIGN KEY ("classification_code_id") REFERENCES "public"."code_groups"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "boards_categories" ADD CONSTRAINT "boards_categories_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "boards_fields" ADD CONSTRAINT "boards_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "boards" ADD CONSTRAINT "boards_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "boards" ADD CONSTRAINT "boards_board_type_id_board_types_id_fk" FOREIGN KEY ("board_type_id") REFERENCES "public"."board_types"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "boards_texts" ADD CONSTRAINT "boards_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "board_types_code_idx" ON "board_types" USING btree ("code");
  CREATE INDEX "board_types_updated_at_idx" ON "board_types" USING btree ("updated_at");
  CREATE INDEX "board_types_created_at_idx" ON "board_types" USING btree ("created_at");
  CREATE INDEX "boards_categories_order_idx" ON "boards_categories" USING btree ("_order");
  CREATE INDEX "boards_categories_parent_id_idx" ON "boards_categories" USING btree ("_parent_id");
  CREATE INDEX "boards_categories_classification_code_idx" ON "boards_categories" USING btree ("classification_code_id");
  CREATE INDEX "boards_fields_order_idx" ON "boards_fields" USING btree ("_order");
  CREATE INDEX "boards_fields_parent_id_idx" ON "boards_fields" USING btree ("_parent_id");
  CREATE INDEX "boards_tenant_idx" ON "boards" USING btree ("tenant_id");
  CREATE UNIQUE INDEX "boards_bbs_id_idx" ON "boards" USING btree ("bbs_id");
  CREATE INDEX "boards_board_type_idx" ON "boards" USING btree ("board_type_id");
  CREATE INDEX "boards_updated_at_idx" ON "boards" USING btree ("updated_at");
  CREATE INDEX "boards_created_at_idx" ON "boards" USING btree ("created_at");
  CREATE INDEX "boards_texts_order_parent" ON "boards_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_board_types_fk" FOREIGN KEY ("board_types_id") REFERENCES "public"."board_types"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_boards_fk" FOREIGN KEY ("boards_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_board_types_id_idx" ON "payload_locked_documents_rels" USING btree ("board_types_id");
  CREATE INDEX "payload_locked_documents_rels_boards_id_idx" ON "payload_locked_documents_rels" USING btree ("boards_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // NOTE: `IF EXISTS` added by hand to the two `DROP CONSTRAINT` lines below
  // (same correction as the 1B/2A/2C down migrations). The preceding
  // `DROP TABLE ... CASCADE` statements already remove each table's
  // `payload_locked_documents_rels_*_fk` from the surviving
  // `payload_locked_documents_rels`, so the un-guarded explicit drops threw
  // `constraint ... does not exist` and broke migrate:down / refresh / reset.
  // Guarding makes the drops idempotent (and the whole down safe to re-run).
  await db.execute(sql`
   ALTER TABLE "board_types" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "boards_categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "boards_fields" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "boards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "boards_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "board_types" CASCADE;
  DROP TABLE "boards_categories" CASCADE;
  DROP TABLE "boards_fields" CASCADE;
  DROP TABLE "boards" CASCADE;
  DROP TABLE "boards_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_board_types_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_boards_fk";

  DROP INDEX "payload_locked_documents_rels_board_types_id_idx";
  DROP INDEX "payload_locked_documents_rels_boards_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "board_types_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "boards_id";
  DROP TYPE "public"."enum_board_types_kind";
  DROP TYPE "public"."enum_boards_fields_input_type";
  DROP TYPE "public"."enum_boards_skin";
  DROP TYPE "public"."enum_boards_board_form";
  DROP TYPE "public"."enum_boards_sort_order";`)
}
