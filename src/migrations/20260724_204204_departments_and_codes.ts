import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "departments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"duties" varchar,
  	"phone" varchar,
  	"fax" varchar,
  	"is_active" boolean DEFAULT true,
  	"parent_id" integer,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "code_classifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "code_groups" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"classification_id" integer NOT NULL,
  	"description" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "codes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"group_id" integer NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"parent_id" integer,
  	"depth" numeric,
  	"order" numeric DEFAULT 0,
  	"description" varchar,
  	"legacy_value" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "departments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "code_classifications_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "code_groups_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "codes_id" integer;
  ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "code_groups" ADD CONSTRAINT "code_groups_classification_id_code_classifications_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."code_classifications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "codes" ADD CONSTRAINT "codes_group_id_code_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."code_groups"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "codes" ADD CONSTRAINT "codes_parent_id_codes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."codes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "departments_parent_idx" ON "departments" USING btree ("parent_id");
  CREATE INDEX "departments_updated_at_idx" ON "departments" USING btree ("updated_at");
  CREATE INDEX "departments_created_at_idx" ON "departments" USING btree ("created_at");
  CREATE UNIQUE INDEX "code_classifications_code_idx" ON "code_classifications" USING btree ("code");
  CREATE INDEX "code_classifications_updated_at_idx" ON "code_classifications" USING btree ("updated_at");
  CREATE INDEX "code_classifications_created_at_idx" ON "code_classifications" USING btree ("created_at");
  CREATE UNIQUE INDEX "code_groups_code_id_idx" ON "code_groups" USING btree ("code_id");
  CREATE INDEX "code_groups_classification_idx" ON "code_groups" USING btree ("classification_id");
  CREATE INDEX "code_groups_updated_at_idx" ON "code_groups" USING btree ("updated_at");
  CREATE INDEX "code_groups_created_at_idx" ON "code_groups" USING btree ("created_at");
  CREATE INDEX "codes_group_idx" ON "codes" USING btree ("group_id");
  CREATE INDEX "codes_parent_idx" ON "codes" USING btree ("parent_id");
  CREATE INDEX "codes_updated_at_idx" ON "codes" USING btree ("updated_at");
  CREATE INDEX "codes_created_at_idx" ON "codes" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_departments_fk" FOREIGN KEY ("departments_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_code_classifications_fk" FOREIGN KEY ("code_classifications_id") REFERENCES "public"."code_classifications"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_code_groups_fk" FOREIGN KEY ("code_groups_id") REFERENCES "public"."code_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_codes_fk" FOREIGN KEY ("codes_id") REFERENCES "public"."codes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_departments_id_idx" ON "payload_locked_documents_rels" USING btree ("departments_id");
  CREATE INDEX "payload_locked_documents_rels_code_classifications_id_idx" ON "payload_locked_documents_rels" USING btree ("code_classifications_id");
  CREATE INDEX "payload_locked_documents_rels_code_groups_id_idx" ON "payload_locked_documents_rels" USING btree ("code_groups_id");
  CREATE INDEX "payload_locked_documents_rels_codes_id_idx" ON "payload_locked_documents_rels" USING btree ("codes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "departments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "code_classifications" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "code_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "codes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "departments" CASCADE;
  DROP TABLE "code_classifications" CASCADE;
  DROP TABLE "code_groups" CASCADE;
  DROP TABLE "codes" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_departments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_code_classifications_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_code_groups_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_codes_fk";
  
  DROP INDEX "payload_locked_documents_rels_departments_id_idx";
  DROP INDEX "payload_locked_documents_rels_code_classifications_id_idx";
  DROP INDEX "payload_locked_documents_rels_code_groups_id_idx";
  DROP INDEX "payload_locked_documents_rels_codes_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "departments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "code_classifications_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "code_groups_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "codes_id";`)
}
