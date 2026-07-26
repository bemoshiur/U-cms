import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Review H4: replace the non-unique (survey, participantKey) index with UNIQUE
  // ones on (survey, participantKey) AND (survey, respondent) — the DB backstop
  // for one-response-per-participant against a find-then-create race. Postgres
  // treats NULLs as distinct, so null-key/null-respondent rows never collide.
  await db.execute(sql`
   DROP INDEX IF EXISTS "survey_participantKey_idx";
  CREATE UNIQUE INDEX "survey_respondent_idx" ON "survey_responses" USING btree ("survey_id","respondent_id");
  CREATE UNIQUE INDEX "survey_participantKey_idx" ON "survey_responses" USING btree ("survey_id","participant_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "survey_respondent_idx";
  DROP INDEX IF EXISTS "survey_participantKey_idx";
  CREATE INDEX "survey_participantKey_idx" ON "survey_responses" USING btree ("survey_id","participant_key");`)
}
