import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Task 4-zero — move access-controlled attachments out of the public `media`
 * pool into the tenant-scoped `attachments` collection (phase-3-final-review
 * §2-B2 full fix).
 *
 * `posts.attachments[].media` and `adminNotices.attachments[].media` are
 * repointed from `media` → `attachments`. This migration therefore both creates
 * the new table AND MOVES any existing referenced upload rows across, remapping
 * the two join tables' `media_id` FK columns, so the new FK constraints hold on
 * a populated database (the FK add would otherwise fail). Every data statement
 * is a natural no-op on an empty database.
 *
 * Referenced `media` rows are COPIED (not deleted) into `attachments`; the
 * originals are left in `media` (harmless orphan uploads) so `down()` can remap
 * back by filename without data loss. Physical files are not relocated on disk —
 * see the report; local byte-serving is a dev-only path (prod uses S3), and no
 * production data exists.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "attachments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );

  ALTER TABLE "posts_attachments" DROP CONSTRAINT "posts_attachments_media_id_media_id_fk";

  ALTER TABLE "admin_notices_attachments" DROP CONSTRAINT "admin_notices_attachments_media_id_media_id_fk";

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "attachments_id" integer;
  ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_sites_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "attachments_tenant_idx" ON "attachments" USING btree ("tenant_id");
  CREATE INDEX "attachments_updated_at_idx" ON "attachments" USING btree ("updated_at");
  CREATE INDEX "attachments_created_at_idx" ON "attachments" USING btree ("created_at");
  CREATE UNIQUE INDEX "attachments_filename_idx" ON "attachments" USING btree ("filename");`)

  // ── DATA MIGRATION (no-op on an empty DB) ─────────────────────────────────
  // Copy every `media` row referenced as a post/notice attachment into
  // `attachments`, keeping a temporary back-reference so the join-table FK
  // columns can be remapped. `media.id IN (...)` dedupes shared rows, and
  // `media.filename` is unique, so the `attachments.filename` unique index holds.
  await db.execute(sql`
   ALTER TABLE "attachments" ADD COLUMN "_legacy_media_id" integer;
  INSERT INTO "attachments" ("alt", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "_legacy_media_id")
  SELECT "alt", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y", "id"
  FROM "media"
  WHERE "id" IN (
    SELECT "media_id" FROM "posts_attachments"
    UNION
    SELECT "media_id" FROM "admin_notices_attachments"
  );
  UPDATE "attachments" a SET "tenant_id" = p."tenant_id"
  FROM "posts_attachments" pa JOIN "posts" p ON p."id" = pa."_parent_id"
  WHERE a."_legacy_media_id" = pa."media_id" AND a."tenant_id" IS NULL;
  UPDATE "attachments" a SET "tenant_id" = an."tenant_id"
  FROM "admin_notices_attachments" ana JOIN "admin_notices" an ON an."id" = ana."_parent_id"
  WHERE a."_legacy_media_id" = ana."media_id" AND a."tenant_id" IS NULL;
  UPDATE "posts_attachments" pa SET "media_id" = a."id"
  FROM "attachments" a WHERE a."_legacy_media_id" = pa."media_id";
  UPDATE "admin_notices_attachments" ana SET "media_id" = a."id"
  FROM "attachments" a WHERE a."_legacy_media_id" = ana."media_id";
  ALTER TABLE "attachments" DROP COLUMN "_legacy_media_id";`)

  // ── New FK constraints (now that all media_id values reference attachments) ─
  await db.execute(sql`
   ALTER TABLE "posts_attachments" ADD CONSTRAINT "posts_attachments_media_id_attachments_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "admin_notices_attachments" ADD CONSTRAINT "admin_notices_attachments_media_id_attachments_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."attachments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_attachments_fk" FOREIGN KEY ("attachments_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_attachments_id_idx" ON "payload_locked_documents_rels" USING btree ("attachments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Drop the attachments-targeting FKs FIRST so the join-table `media_id`
  // columns can be remapped back to `media` ids without violating them.
  // `IF EXISTS` mirrors the 1B/2A/2C/3A pattern (the later `DROP TABLE ...
  // CASCADE` would already have removed them on a re-run).
  await db.execute(sql`
   ALTER TABLE "posts_attachments" DROP CONSTRAINT IF EXISTS "posts_attachments_media_id_attachments_id_fk";
  ALTER TABLE "admin_notices_attachments" DROP CONSTRAINT IF EXISTS "admin_notices_attachments_media_id_attachments_id_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_attachments_fk";`)

  // ── DATA REVERSE (no-op on an empty DB) ───────────────────────────────────
  // Move attachment data back into `media` before re-adding the media FKs.
  // Two cases: (a) attachments up() COPIED from media still have their original
  // filename-matching row in media; (b) attachments created NATIVELY after the
  // migration have no media counterpart — recreate those referenced rows in
  // media first (media.alt is NOT NULL, so COALESCE a label). Then every
  // referenced attachment has a filename-matching media row and the join-table
  // media_id columns can be remapped from attachment ids back to media ids.
  await db.execute(sql`
   INSERT INTO "media" ("alt", "updated_at", "created_at", "url", "thumbnail_u_r_l", "filename", "mime_type", "filesize", "width", "height", "focal_x", "focal_y")
  SELECT COALESCE(a."alt", a."filename", 'attachment'), a."updated_at", a."created_at", a."url", a."thumbnail_u_r_l", a."filename", a."mime_type", a."filesize", a."width", a."height", a."focal_x", a."focal_y"
  FROM "attachments" a
  WHERE a."filename" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "media" m WHERE m."filename" = a."filename")
    AND (a."id" IN (SELECT "media_id" FROM "posts_attachments") OR a."id" IN (SELECT "media_id" FROM "admin_notices_attachments"));
  UPDATE "posts_attachments" pa SET "media_id" = m."id"
  FROM "attachments" a JOIN "media" m ON m."filename" = a."filename"
  WHERE pa."media_id" = a."id";
  UPDATE "admin_notices_attachments" ana SET "media_id" = m."id"
  FROM "attachments" a JOIN "media" m ON m."filename" = a."filename"
  WHERE ana."media_id" = a."id";`)

  // `DROP CONSTRAINT IF EXISTS` before each re-ADD keeps the re-add idempotent
  // / safe-to-re-run, consistent with the established down-migration pattern
  // (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so guard the drop side).
  await db.execute(sql`
   ALTER TABLE "posts_attachments" DROP CONSTRAINT IF EXISTS "posts_attachments_media_id_media_id_fk";
  ALTER TABLE "posts_attachments" ADD CONSTRAINT "posts_attachments_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "admin_notices_attachments" DROP CONSTRAINT IF EXISTS "admin_notices_attachments_media_id_media_id_fk";
  ALTER TABLE "admin_notices_attachments" ADD CONSTRAINT "admin_notices_attachments_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  DROP INDEX IF EXISTS "payload_locked_documents_rels_attachments_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "attachments_id";
  ALTER TABLE "attachments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "attachments" CASCADE;`)
}
