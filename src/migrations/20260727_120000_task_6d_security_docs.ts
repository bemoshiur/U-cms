import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Task 6D (ref 3-4, plan §2.3): the four §3 security-document libraries are
// mounted board-engine records flagged `securityDoc`. Adds the boolean flag to
// `boards` (the authoritative class marker, settable only with the privacy
// grant) and denormalizes it onto `posts` (auto-set from the post's board, like
// `board_kind`) so the privacy access gate can filter without a join. `DEFAULT
// false` backfills every existing row to false, so `equals`/`not_equals` on the
// column never hit a NULL. `down` is IF-EXISTS-guarded for an idempotent
// round-trip (Phase-2 D2 / Task 4E/5A/5C/6A/6C pattern).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "security_doc" boolean DEFAULT false;
   ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "security_doc" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "boards" DROP COLUMN IF EXISTS "security_doc";
   ALTER TABLE "posts" DROP COLUMN IF EXISTS "security_doc";`)
}
