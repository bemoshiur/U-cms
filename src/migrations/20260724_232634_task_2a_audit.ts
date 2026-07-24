import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_access_logs_action" AS ENUM('login', 'logout', 'list', 'view', 'create', 'update', 'delete');
  CREATE TABLE "access_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"actor_id" integer,
  	"actor_label" varchar,
  	"menu_key" varchar,
  	"menu_label" varchar,
  	"action" "enum_access_logs_action" NOT NULL,
  	"url" varchar NOT NULL,
  	"ip_address" varchar,
  	"session_login_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "login_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_label" varchar,
  	"login_id" varchar,
  	"success" boolean,
  	"fail_reason" varchar,
  	"ip_address" varchar,
  	"is_overseas" boolean DEFAULT false,
  	"is_mobile" boolean DEFAULT false,
  	"user_agent" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "permission_change_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"target_user_label" varchar,
  	"target_user_id" varchar,
  	"target_user_email" varchar,
  	"change_summary" varchar,
  	"actor_label" varchar,
  	"ip_address" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "menu_permission_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role_label" varchar,
  	"role_id" varchar,
  	"added_menus" jsonb,
  	"removed_menus" jsonb,
  	"role_member_snapshot" jsonb,
  	"actor_label" varchar,
  	"ip_address" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "access_logs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "login_history_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "permission_change_logs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "menu_permission_logs_id" integer;
  ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "access_logs_actor_idx" ON "access_logs" USING btree ("actor_id");
  CREATE INDEX "access_logs_action_idx" ON "access_logs" USING btree ("action");
  CREATE INDEX "access_logs_updated_at_idx" ON "access_logs" USING btree ("updated_at");
  CREATE INDEX "access_logs_created_at_idx" ON "access_logs" USING btree ("created_at");
  CREATE INDEX "login_history_success_idx" ON "login_history" USING btree ("success");
  CREATE INDEX "login_history_is_overseas_idx" ON "login_history" USING btree ("is_overseas");
  CREATE INDEX "login_history_is_mobile_idx" ON "login_history" USING btree ("is_mobile");
  CREATE INDEX "login_history_updated_at_idx" ON "login_history" USING btree ("updated_at");
  CREATE INDEX "login_history_created_at_idx" ON "login_history" USING btree ("created_at");
  CREATE INDEX "permission_change_logs_updated_at_idx" ON "permission_change_logs" USING btree ("updated_at");
  CREATE INDEX "permission_change_logs_created_at_idx" ON "permission_change_logs" USING btree ("created_at");
  CREATE INDEX "menu_permission_logs_updated_at_idx" ON "menu_permission_logs" USING btree ("updated_at");
  CREATE INDEX "menu_permission_logs_created_at_idx" ON "menu_permission_logs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_access_logs_fk" FOREIGN KEY ("access_logs_id") REFERENCES "public"."access_logs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_login_history_fk" FOREIGN KEY ("login_history_id") REFERENCES "public"."login_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_permission_change_logs_fk" FOREIGN KEY ("permission_change_logs_id") REFERENCES "public"."permission_change_logs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menu_permission_logs_fk" FOREIGN KEY ("menu_permission_logs_id") REFERENCES "public"."menu_permission_logs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_access_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("access_logs_id");
  CREATE INDEX "payload_locked_documents_rels_login_history_id_idx" ON "payload_locked_documents_rels" USING btree ("login_history_id");
  CREATE INDEX "payload_locked_documents_rels_permission_change_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("permission_change_logs_id");
  CREATE INDEX "payload_locked_documents_rels_menu_permission_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("menu_permission_logs_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "access_logs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "login_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "permission_change_logs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "menu_permission_logs" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "access_logs" CASCADE;
  DROP TABLE "login_history" CASCADE;
  DROP TABLE "permission_change_logs" CASCADE;
  DROP TABLE "menu_permission_logs" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_access_logs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_login_history_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_permission_change_logs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_menu_permission_logs_fk";
  
  DROP INDEX "payload_locked_documents_rels_access_logs_id_idx";
  DROP INDEX "payload_locked_documents_rels_login_history_id_idx";
  DROP INDEX "payload_locked_documents_rels_permission_change_logs_id_idx";
  DROP INDEX "payload_locked_documents_rels_menu_permission_logs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "access_logs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "login_history_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "permission_change_logs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "menu_permission_logs_id";
  DROP TYPE "public"."enum_access_logs_action";`)
}
