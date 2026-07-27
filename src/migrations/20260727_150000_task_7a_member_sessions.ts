import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Task 7A #1b — enable a REVOCABLE member session store. The `members` auth
// collection flipped from stateless JWTs (`useSessions: false`) to server-side
// sessions (`useSessions: true`) so a status-change can invalidate live member
// tokens immediately (revokeMemberSessionsOnStatusChange). Payload models the
// session store as a `members_sessions` array table, IDENTICAL in shape to the
// existing `users_sessions` table (see the initial migration) — this migration
// creates it. `down` is IF-EXISTS-guarded + CASCADE (Phase-2 D2 pattern) so a
// rollback never errors on a partially-applied state.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "members_sessions" (
     "_order" integer NOT NULL,
     "_parent_id" integer NOT NULL,
     "id" varchar PRIMARY KEY NOT NULL,
     "created_at" timestamp(3) with time zone,
     "expires_at" timestamp(3) with time zone NOT NULL
   );
   DO $$ BEGIN
     ALTER TABLE "members_sessions" ADD CONSTRAINT "members_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
   EXCEPTION WHEN duplicate_object THEN null; END $$;
   CREATE INDEX IF NOT EXISTS "members_sessions_order_idx" ON "members_sessions" USING btree ("_order");
   CREATE INDEX IF NOT EXISTS "members_sessions_parent_id_idx" ON "members_sessions" USING btree ("_parent_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "members_sessions" CASCADE;`)
}
