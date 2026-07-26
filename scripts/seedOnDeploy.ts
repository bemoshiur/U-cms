/**
 * Optional, gated seed-on-deploy step (Task TR2 Part 1).
 *
 * Runs the full seed registry (`src/seed`) — super-admin + `bos`/`demo` sites +
 * the rest — but ONLY when `SEED_ON_DEPLOY` is truthy (`true`/`1`/`yes`/`on`).
 * When unset/false it is a no-op that exits 0, so it is safe to leave chained in
 * the Vercel Build Command (`pnpm ci:deploy && pnpm build`) on EVERY deploy: the
 * owner sets `SEED_ON_DEPLOY=true` for the FIRST deploy (to create the login),
 * then turns it off. The seed itself is idempotent, so an accidental re-run
 * never duplicates or clobbers operator edits.
 *
 * Env:
 *   SEED_ON_DEPLOY      when truthy, run the seed; otherwise skip (no-op).
 *   SEED_ADMIN_EMAIL    super-admin email (defaults to a dev value — set it!).
 *   SEED_ADMIN_PASSWORD super-admin password. REQUIRED in production: the
 *                       super-admin seed step hard-refuses to create the admin
 *                       with the built-in dev-only default password when
 *                       NODE_ENV=production (see
 *                       `assertSeedAdminPasswordSafeForProduction` in
 *                       src/seed/steps/superAdmin.ts), so a prod seed with this
 *                       unset fails fast rather than exposing a known password.
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { runSeed } from '../src/seed'

function isTruthy(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

async function main() {
  if (!isTruthy(process.env.SEED_ON_DEPLOY)) {
    console.info('[ci:seed] SEED_ON_DEPLOY is not truthy — skipping seed (no-op).')
    process.exit(0)
  }

  const payload = await getPayload({ config })
  await runSeed(payload)
  payload.logger.info('[ci:seed] seed-on-deploy complete.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
