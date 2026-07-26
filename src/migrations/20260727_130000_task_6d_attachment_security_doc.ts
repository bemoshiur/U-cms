import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Task 6D (round-3 fix): denormalize the §3 security-document class onto the
// `attachments` upload pool so the raw `/api/attachments[/file]` routes (gated on
// the attachment's own read access) cannot leak a security-doc file to a
// content-only admin. Adds the boolean flag (DEFAULT false → backfills every
// existing row to false) and then BACKFILLS true for any attachment referenced by
// an existing security-doc post (via the `posts_attachments` join). Kept in sync
// thereafter by the posts `syncAttachmentSecurityDoc` hook + the board→posts
// flag-flip propagation. `down` is IF-EXISTS-guarded (Phase-2 D2 pattern).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "security_doc" boolean DEFAULT false;
   UPDATE "attachments" SET "security_doc" = true
     WHERE "id" IN (
       SELECT pa."media_id"
       FROM "posts_attachments" pa
       JOIN "posts" p ON p."id" = pa."_parent_id"
       WHERE p."security_doc" = true AND pa."media_id" IS NOT NULL
     );`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "attachments" DROP COLUMN IF EXISTS "security_doc";`)
}
