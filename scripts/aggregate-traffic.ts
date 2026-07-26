/**
 * Traffic aggregation + retention sweep (Task 5A; TODO 5.1). Rolls up the given
 * day's raw `pageViews` into the per-(site, day) `trafficDaily` documents for
 * EVERY site, then prunes raw page views past their retention window (only for
 * days already aggregated — never destroys un-rolled-up data).
 *
 * Cron-ready (mirrors `scripts/mark-dormant.ts` → `dormancy:sweep`): schedule
 * this daily (e.g. shortly after midnight UTC) via the host's scheduler. Both
 * steps are IDEMPOTENT, so a re-run for the same date overwrites its rollups and
 * never double-counts.
 *
 * Usage:
 *   pnpm aggregate:traffic                 # aggregate YESTERDAY (UTC) + prune
 *   pnpm aggregate:traffic 2026-07-20      # aggregate a specific UTC day + prune
 *   pnpm aggregate:traffic 2026-07-20 no-prune   # aggregate only, skip pruning
 *
 * Jobs-queue note: Payload 3.86 has a native jobs queue, but its cron autoRun is
 * discouraged on serverless (Vercel) and adds a jobs collection + migration. This
 * script is the established cron seam; promoting to a native job later is a
 * drop-in call to the same `aggregateAllTenantsForDate` / `pruneAgedPageViews`.
 */
import 'dotenv/config'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import {
  aggregateAllTenantsForDate,
  pruneAgedPageViews,
  yesterdayUtc,
} from '../src/site/trafficAggregation'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function main() {
  const dateArg = process.argv[2]
  const skipPrune = process.argv.includes('no-prune')

  const date = dateArg && DATE_RE.test(dateArg) ? dateArg : yesterdayUtc()
  if (dateArg && !DATE_RE.test(dateArg) && dateArg !== 'no-prune') {
    console.error(`Invalid date "${dateArg}" — expected YYYY-MM-DD.`)
    process.exit(1)
  }

  const payload = await getPayload({ config })

  const results = await aggregateAllTenantsForDate(payload, date)
  const totalViews = results.reduce((sum, r) => sum + r.totalViews, 0)
  payload.logger.info(
    `[traffic] aggregated ${date} for ${results.length} site(s); ${totalViews} view(s) rolled up.`,
  )

  if (!skipPrune) {
    const pruned = await pruneAgedPageViews(payload)
    payload.logger.info(
      `[traffic] retention: deleted ${pruned.deleted} aged view(s), skipped ${pruned.skippedUnaggregatedDays} un-aggregated day(s).`,
    )
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
