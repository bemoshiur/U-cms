import type { Payload, PayloadRequest } from 'payload'

/**
 * Dormancy sweep (legacy 장기 미로그인 — ref 1-16; Task 1D brief Part 5).
 *
 * Flips `active` accounts to `dormant` once they have not logged in for
 * `thresholdDays`. Dormant accounts are then blocked at login by
 * `blockInactiveLogin` (see `src/auth/userHooks.ts`); an admin reactivates one
 * by setting `status` back to `active`.
 *
 * "Last activity" is `lastLoginAt` when present, else `createdAt` — so an
 * account that was approved but never logged in for the whole threshold window
 * is swept too, while a freshly-approved account is not (its `createdAt` is
 * recent). Only `active` accounts are considered; `pending`/`dormant`/`locked`
 * are left untouched.
 *
 * Pure utility (takes an explicit `payload`) so it can be driven equally by
 * `scripts/mark-dormant.ts` (cron-ready) or a future Payload jobs-queue task.
 */

export const DEFAULT_DORMANCY_THRESHOLD_DAYS = 90

export type MarkDormantResult = {
  /** How many accounts were flipped from active → dormant. */
  markedDormant: number
  /** IDs of the accounts that were flipped (useful for logging/tests). */
  ids: (number | string)[]
}

export async function markDormantAccounts(
  payload: Payload,
  thresholdDays: number = DEFAULT_DORMANCY_THRESHOLD_DAYS,
  req?: PayloadRequest,
): Promise<MarkDormantResult> {
  const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString()

  const stale = await payload.find({
    collection: 'users',
    where: {
      and: [
        { status: { equals: 'active' } },
        {
          or: [
            { lastLoginAt: { less_than: cutoff } },
            {
              and: [{ lastLoginAt: { exists: false } }, { createdAt: { less_than: cutoff } }],
            },
          ],
        },
      ],
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const ids: (number | string)[] = []
  for (const user of stale.docs) {
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { status: 'dormant' },
      overrideAccess: true,
      req,
    })
    ids.push(user.id)
  }

  payload.logger.info(
    `[dormancy] marked ${ids.length} account(s) dormant (threshold ${thresholdDays} days).`,
  )

  return { markedDormant: ids.length, ids }
}
