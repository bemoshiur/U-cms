/**
 * Runs the seed registry (`src/seed`) against the configured database.
 *
 * Idempotent — safe to run repeatedly. Each step decides for itself
 * whether its target data already exists and skips accordingly.
 *
 * Usage:
 *   pnpm seed
 *
 * Env:
 *   SEED_ADMIN_EMAIL     defaults to admin@publicpulse.com.bd
 *   SEED_ADMIN_PASSWORD  defaults to a dev-only placeholder (a warning is
 *                        logged when the default is used)
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { runSeed } from '../src/seed'

async function main() {
  const payload = await getPayload({ config })

  await runSeed(payload)

  payload.logger.info('[seed] done.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
