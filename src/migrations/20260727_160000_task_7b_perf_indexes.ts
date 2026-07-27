import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Task 7B (TODO 7.2) — performance composite indexes on `posts` (the largest
// content table). Each index supports a demonstrated hot query that FILTERS on
// one column and SORTS on `createdAt`, turning a "filter then in-memory sort of
// the whole subset" into a single index range scan:
//
//   - board_createdAt_idx  (board_id, created_at):
//       the PUBLIC board list / gallery / notice reads (src/site/board.ts) —
//       `where board = X [+ non-selective exclusions] sort -createdAt` paginated,
//       run on every board page load. `board` is high-cardinality (selective).
//
//   - tenant_createdAt_idx (tenant_id, created_at):
//       the admin dashboard's tenant-scoped post reads + tallies
//       (src/site/dashboardData.ts) — recent / most-viewed / Q&A and the
//       postsTotal / postsToday counts, all `where tenant = X ...`.
//
// Names MATCH what Payload's compound-index auto-namer derives from the
// collection `indexes` on `posts` (Posts.ts) — `{fieldA}_{fieldB}_idx` with the
// camelCase field name preserved (cf. survey_participantKey_idx) — so the
// dev/test PUSH path and this migration converge on the SAME index objects.
//
// Additive + behaviour-neutral (indexes change only performance). `IF NOT
// EXISTS` / `IF EXISTS` make the up/down idempotent and round-trippable on a
// partially-applied state (Phase-2 D2 / T6D / T7A pattern). No columns, types,
// or constraints change, so there is nothing else to migrate.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX IF NOT EXISTS "board_createdAt_idx" ON "posts" USING btree ("board_id","created_at");
   CREATE INDEX IF NOT EXISTS "tenant_createdAt_idx" ON "posts" USING btree ("tenant_id","created_at");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "board_createdAt_idx";
   DROP INDEX IF EXISTS "tenant_createdAt_idx";`)
}
