import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" ADD COLUMN "totp_secret" varchar;
  ALTER TABLE "users" ADD COLUMN "totp_confirmed" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "totp_enrolled_at" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "reset_two_factor_device" boolean DEFAULT false;
  ALTER TABLE "users" ADD COLUMN "regenerate_two_factor_secret" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users" DROP COLUMN "totp_secret";
  ALTER TABLE "users" DROP COLUMN "totp_confirmed";
  ALTER TABLE "users" DROP COLUMN "totp_enrolled_at";
  ALTER TABLE "users" DROP COLUMN "reset_two_factor_device";
  ALTER TABLE "users" DROP COLUMN "regenerate_two_factor_secret";`)
}
