import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_member_banned_words_scope" AS ENUM('common', 'loginId', 'password');
  CREATE TABLE "posts_attachments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer NOT NULL,
  	"description" varchar,
  	"is_representative" boolean DEFAULT false,
  	"file_sn" numeric DEFAULT 0,
  	"download_count" numeric DEFAULT 0
  );
  
  CREATE TABLE "posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"board_id" integer NOT NULL,
  	"board_kind" varchar,
  	"title" varchar NOT NULL,
  	"author" varchar,
  	"author_user_id" integer,
  	"department_id" integer,
  	"team" varchar,
  	"content" jsonb,
  	"view_count" numeric DEFAULT 0,
  	"is_notice" boolean DEFAULT false,
  	"notice_from" timestamp(3) with time zone,
  	"notice_to" timestamp(3) with time zone,
  	"is_secret" boolean DEFAULT false,
  	"category1_id" integer,
  	"category2_id" integer,
  	"category3_id" integer,
  	"extra_field1" varchar,
  	"extra_field2" varchar,
  	"extra_field3" varchar,
  	"extra_field4" varchar,
  	"extra_content1" varchar,
  	"extra_content2" varchar,
  	"extra_content3" varchar,
  	"extra_content4" varchar,
  	"answer" jsonb,
  	"answered_by_id" integer,
  	"answered_at" timestamp(3) with time zone,
  	"is_answered" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "profanity_words" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"word" varchar NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"registrant_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "member_banned_words" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"word" varchar NOT NULL,
  	"scope" "enum_member_banned_words_scope" DEFAULT 'common' NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "posts_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "profanity_words_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_banned_words_id" integer;
  ALTER TABLE "posts_attachments" ADD CONSTRAINT "posts_attachments_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_attachments" ADD CONSTRAINT "posts_attachments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_category1_id_codes_id_fk" FOREIGN KEY ("category1_id") REFERENCES "public"."codes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_category2_id_codes_id_fk" FOREIGN KEY ("category2_id") REFERENCES "public"."codes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_category3_id_codes_id_fk" FOREIGN KEY ("category3_id") REFERENCES "public"."codes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_answered_by_id_users_id_fk" FOREIGN KEY ("answered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "profanity_words" ADD CONSTRAINT "profanity_words_registrant_id_users_id_fk" FOREIGN KEY ("registrant_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "posts_attachments_order_idx" ON "posts_attachments" USING btree ("_order");
  CREATE INDEX "posts_attachments_parent_id_idx" ON "posts_attachments" USING btree ("_parent_id");
  CREATE INDEX "posts_attachments_media_idx" ON "posts_attachments" USING btree ("media_id");
  CREATE INDEX "posts_tenant_idx" ON "posts" USING btree ("tenant_id");
  CREATE INDEX "posts_board_idx" ON "posts" USING btree ("board_id");
  CREATE INDEX "posts_author_user_idx" ON "posts" USING btree ("author_user_id");
  CREATE INDEX "posts_department_idx" ON "posts" USING btree ("department_id");
  CREATE INDEX "posts_category1_idx" ON "posts" USING btree ("category1_id");
  CREATE INDEX "posts_category2_idx" ON "posts" USING btree ("category2_id");
  CREATE INDEX "posts_category3_idx" ON "posts" USING btree ("category3_id");
  CREATE INDEX "posts_answered_by_idx" ON "posts" USING btree ("answered_by_id");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE UNIQUE INDEX "profanity_words_word_idx" ON "profanity_words" USING btree ("word");
  CREATE INDEX "profanity_words_registrant_idx" ON "profanity_words" USING btree ("registrant_id");
  CREATE INDEX "profanity_words_updated_at_idx" ON "profanity_words" USING btree ("updated_at");
  CREATE INDEX "profanity_words_created_at_idx" ON "profanity_words" USING btree ("created_at");
  CREATE INDEX "member_banned_words_updated_at_idx" ON "member_banned_words" USING btree ("updated_at");
  CREATE INDEX "member_banned_words_created_at_idx" ON "member_banned_words" USING btree ("created_at");
  CREATE UNIQUE INDEX "word_scope_idx" ON "member_banned_words" USING btree ("word","scope");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_profanity_words_fk" FOREIGN KEY ("profanity_words_id") REFERENCES "public"."profanity_words"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_banned_words_fk" FOREIGN KEY ("member_banned_words_id") REFERENCES "public"."member_banned_words"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_profanity_words_id_idx" ON "payload_locked_documents_rels" USING btree ("profanity_words_id");
  CREATE INDEX "payload_locked_documents_rels_member_banned_words_id_idx" ON "payload_locked_documents_rels" USING btree ("member_banned_words_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // NOTE: `IF EXISTS` added by hand to the three `DROP CONSTRAINT` lines below
  // (same correction as the 1B/2A/2C/3A down migrations). The preceding
  // `DROP TABLE ... CASCADE` statements already remove each table's
  // `payload_locked_documents_rels_*_fk` from the surviving
  // `payload_locked_documents_rels`, so the un-guarded explicit drops threw
  // `constraint ... does not exist` and broke migrate:down / refresh / reset.
  // Guarding makes the drops idempotent (and the whole down safe to re-run).
  await db.execute(sql`
   ALTER TABLE "posts_attachments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "profanity_words" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "member_banned_words" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts_attachments" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "profanity_words" CASCADE;
  DROP TABLE "member_banned_words" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_posts_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_profanity_words_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_member_banned_words_fk";

  DROP INDEX "payload_locked_documents_rels_posts_id_idx";
  DROP INDEX "payload_locked_documents_rels_profanity_words_id_idx";
  DROP INDEX "payload_locked_documents_rels_member_banned_words_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "posts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "profanity_words_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_banned_words_id";
  DROP TYPE "public"."enum_member_banned_words_scope";`)
}
