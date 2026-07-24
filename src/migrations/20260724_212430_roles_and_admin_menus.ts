import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "users_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"roles_id" integer
  );
  
  CREATE TABLE "roles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role_id" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"is_super" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "roles_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"admin_menus_id" integer
  );
  
  CREATE TABLE "admin_menus" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"menu_key" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"parent_id" integer,
  	"order" numeric DEFAULT 0,
  	"collection_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "name" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "roles_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "admin_menus_id" integer;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roles_rels" ADD CONSTRAINT "roles_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roles_rels" ADD CONSTRAINT "roles_rels_admin_menus_fk" FOREIGN KEY ("admin_menus_id") REFERENCES "public"."admin_menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admin_menus" ADD CONSTRAINT "admin_menus_parent_id_admin_menus_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."admin_menus"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_rels_order_idx" ON "users_rels" USING btree ("order");
  CREATE INDEX "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
  CREATE INDEX "users_rels_path_idx" ON "users_rels" USING btree ("path");
  CREATE INDEX "users_rels_roles_id_idx" ON "users_rels" USING btree ("roles_id");
  CREATE UNIQUE INDEX "roles_role_id_idx" ON "roles" USING btree ("role_id");
  CREATE INDEX "roles_updated_at_idx" ON "roles" USING btree ("updated_at");
  CREATE INDEX "roles_created_at_idx" ON "roles" USING btree ("created_at");
  CREATE INDEX "roles_rels_order_idx" ON "roles_rels" USING btree ("order");
  CREATE INDEX "roles_rels_parent_idx" ON "roles_rels" USING btree ("parent_id");
  CREATE INDEX "roles_rels_path_idx" ON "roles_rels" USING btree ("path");
  CREATE INDEX "roles_rels_admin_menus_id_idx" ON "roles_rels" USING btree ("admin_menus_id");
  CREATE UNIQUE INDEX "admin_menus_menu_key_idx" ON "admin_menus" USING btree ("menu_key");
  CREATE INDEX "admin_menus_parent_idx" ON "admin_menus" USING btree ("parent_id");
  CREATE INDEX "admin_menus_updated_at_idx" ON "admin_menus" USING btree ("updated_at");
  CREATE INDEX "admin_menus_created_at_idx" ON "admin_menus" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roles_fk" FOREIGN KEY ("roles_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admin_menus_fk" FOREIGN KEY ("admin_menus_id") REFERENCES "public"."admin_menus"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_roles_id_idx" ON "payload_locked_documents_rels" USING btree ("roles_id");
  CREATE INDEX "payload_locked_documents_rels_admin_menus_id_idx" ON "payload_locked_documents_rels" USING btree ("admin_menus_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roles_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "admin_menus" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_rels" CASCADE;
  DROP TABLE "roles" CASCADE;
  DROP TABLE "roles_rels" CASCADE;
  DROP TABLE "admin_menus" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_roles_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_admin_menus_fk";
  
  DROP INDEX "payload_locked_documents_rels_roles_id_idx";
  DROP INDEX "payload_locked_documents_rels_admin_menus_id_idx";
  ALTER TABLE "users" DROP COLUMN "name";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "roles_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "admin_menus_id";`)
}
