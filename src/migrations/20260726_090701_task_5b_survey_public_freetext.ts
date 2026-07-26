import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Task 5B (D3): per-question opt-in that shows a question's verbatim free-text
// in PUBLIC survey results (default OFF). D5 (download-count atomicity) needs NO
// schema change — the `posts_attachments.download_count` column already exists;
// the fix is purely in the increment path (src/endpoints/fileDownload.ts).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "survey_questions" ADD COLUMN IF NOT EXISTS "include_in_public_results" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "survey_questions" DROP COLUMN IF EXISTS "include_in_public_results";`)
}
