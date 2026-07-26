import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_surveys_audience" AS ENUM('anyone', 'members');
  CREATE TYPE "public"."enum_surveys_result_visibility" AS ENUM('afterClose', 'duringAndAfter', 'adminsOnly');
  CREATE TYPE "public"."enum_survey_questions_type" AS ENUM('single', 'multi', 'text', 'textarea');
  CREATE TABLE "surveys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"title" varchar NOT NULL,
  	"description" jsonb,
  	"department_id" integer,
  	"contact_phone" varchar,
  	"topic" varchar,
  	"open_from" timestamp(3) with time zone,
  	"open_to" timestamp(3) with time zone,
  	"is_active" boolean DEFAULT true,
  	"audience" "enum_surveys_audience" DEFAULT 'anyone' NOT NULL,
  	"result_visibility" "enum_surveys_result_visibility" DEFAULT 'afterClose' NOT NULL,
  	"anonymous" boolean DEFAULT false,
  	"has_responses" boolean DEFAULT false,
  	"started_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "survey_questions_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"value" varchar,
  	"order" numeric DEFAULT 1,
  	"is_other" boolean DEFAULT false,
  	"next_question_order" numeric
  );
  
  CREATE TABLE "survey_questions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"survey_id" integer NOT NULL,
  	"order" numeric DEFAULT 1,
  	"text" varchar NOT NULL,
  	"type" "enum_survey_questions_type" DEFAULT 'single' NOT NULL,
  	"required" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "survey_responses_answers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question_id" integer NOT NULL,
  	"text_value" varchar
  );
  
  CREATE TABLE "survey_responses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"survey_id" integer NOT NULL,
  	"respondent_id" integer,
  	"submitted_at" timestamp(3) with time zone,
  	"participant_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "survey_responses_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "surveys_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "survey_questions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "survey_responses_id" integer;
  ALTER TABLE "surveys" ADD CONSTRAINT "surveys_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "surveys" ADD CONSTRAINT "surveys_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_questions_options" ADD CONSTRAINT "survey_questions_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."survey_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_questions" ADD CONSTRAINT "survey_questions_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_responses_answers" ADD CONSTRAINT "survey_responses_answers_question_id_survey_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_responses_answers" ADD CONSTRAINT "survey_responses_answers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_respondent_id_members_id_fk" FOREIGN KEY ("respondent_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "survey_responses_texts" ADD CONSTRAINT "survey_responses_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "surveys_tenant_idx" ON "surveys" USING btree ("tenant_id");
  CREATE INDEX "surveys_department_idx" ON "surveys" USING btree ("department_id");
  CREATE INDEX "surveys_updated_at_idx" ON "surveys" USING btree ("updated_at");
  CREATE INDEX "surveys_created_at_idx" ON "surveys" USING btree ("created_at");
  CREATE INDEX "survey_questions_options_order_idx" ON "survey_questions_options" USING btree ("_order");
  CREATE INDEX "survey_questions_options_parent_id_idx" ON "survey_questions_options" USING btree ("_parent_id");
  CREATE INDEX "survey_questions_tenant_idx" ON "survey_questions" USING btree ("tenant_id");
  CREATE INDEX "survey_questions_survey_idx" ON "survey_questions" USING btree ("survey_id");
  CREATE INDEX "survey_questions_updated_at_idx" ON "survey_questions" USING btree ("updated_at");
  CREATE INDEX "survey_questions_created_at_idx" ON "survey_questions" USING btree ("created_at");
  CREATE INDEX "survey_responses_answers_order_idx" ON "survey_responses_answers" USING btree ("_order");
  CREATE INDEX "survey_responses_answers_parent_id_idx" ON "survey_responses_answers" USING btree ("_parent_id");
  CREATE INDEX "survey_responses_answers_question_idx" ON "survey_responses_answers" USING btree ("question_id");
  CREATE INDEX "survey_responses_tenant_idx" ON "survey_responses" USING btree ("tenant_id");
  CREATE INDEX "survey_responses_survey_idx" ON "survey_responses" USING btree ("survey_id");
  CREATE INDEX "survey_responses_respondent_idx" ON "survey_responses" USING btree ("respondent_id");
  CREATE INDEX "survey_responses_updated_at_idx" ON "survey_responses" USING btree ("updated_at");
  CREATE INDEX "survey_responses_created_at_idx" ON "survey_responses" USING btree ("created_at");
  CREATE INDEX "survey_participantKey_idx" ON "survey_responses" USING btree ("survey_id","participant_key");
  CREATE INDEX "survey_responses_texts_order_parent" ON "survey_responses_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_surveys_fk" FOREIGN KEY ("surveys_id") REFERENCES "public"."surveys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_survey_questions_fk" FOREIGN KEY ("survey_questions_id") REFERENCES "public"."survey_questions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_survey_responses_fk" FOREIGN KEY ("survey_responses_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_surveys_id_idx" ON "payload_locked_documents_rels" USING btree ("surveys_id");
  CREATE INDEX "payload_locked_documents_rels_survey_questions_id_idx" ON "payload_locked_documents_rels" USING btree ("survey_questions_id");
  CREATE INDEX "payload_locked_documents_rels_survey_responses_id_idx" ON "payload_locked_documents_rels" USING btree ("survey_responses_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "surveys" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_questions_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_questions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_responses_answers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_responses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "survey_responses_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "surveys" CASCADE;
  DROP TABLE "survey_questions_options" CASCADE;
  DROP TABLE "survey_questions" CASCADE;
  DROP TABLE "survey_responses_answers" CASCADE;
  DROP TABLE "survey_responses" CASCADE;
  DROP TABLE "survey_responses_texts" CASCADE;
  -- IF EXISTS: the DROP TABLE ... CASCADE statements above already remove any FK
  -- constraints on payload_locked_documents_rels that reference the dropped
  -- survey tables, so these explicit drops must be idempotent for a clean down
  -- round-trip (Phase-2 D2 / Task 4B members-migration pattern).
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_surveys_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_survey_questions_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_survey_responses_fk";

  DROP INDEX IF EXISTS "payload_locked_documents_rels_surveys_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_survey_questions_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_survey_responses_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "surveys_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "survey_questions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "survey_responses_id";
  DROP TYPE IF EXISTS "public"."enum_surveys_audience";
  DROP TYPE IF EXISTS "public"."enum_surveys_result_visibility";
  DROP TYPE IF EXISTS "public"."enum_survey_questions_type";`)
}
