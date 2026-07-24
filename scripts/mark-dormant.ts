/**
 * Dormancy sweep (Task 1D Part 5 — legacy 장기 미로그인). Flips `active`
 * accounts that have not logged in for a threshold window to `dormant`, which
 * then blocks them at login (see `src/auth/userHooks.ts`).
 *
 * Cron-ready: schedule this (e.g. daily) via the host's scheduler.
 *
 * Usage:
 *   pnpm dormancy:sweep            # default threshold (90 days)
 *   pnpm dormancy:sweep 30         # custom threshold in days
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { DEFAULT_DORMANCY_THRESHOLD_DAYS, markDormantAccounts } from '../src/accounts/dormancy'

async function main() {
  const arg = process.argv[2]
  const thresholdDays = arg !== undefined ? Number(arg) : DEFAULT_DORMANCY_THRESHOLD_DAYS

  if (!Number.isFinite(thresholdDays) || thresholdDays <= 0) {
    console.error(`Invalid threshold "${arg}" — must be a positive number of days.`)
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const result = await markDormantAccounts(payload, thresholdDays)

  payload.logger.info(`[dormancy] done — ${result.markedDormant} account(s) marked dormant.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
