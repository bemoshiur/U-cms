import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Task 6C (ref 3-9): adds the version-history attribution column to
// `password_policies` (a denormalized name(loginId) snapshot stamped on create;
// see src/collections/PasswordPolicies.ts). `down` is IF-EXISTS-guarded for an
// idempotent round-trip (Phase-2 D2 / Task 4E/5A/5C/6A pattern).
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "password_policies" ADD COLUMN IF NOT EXISTS "created_by" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "password_policies" DROP COLUMN IF EXISTS "created_by";`)
}
