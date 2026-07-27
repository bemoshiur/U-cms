import { timingSafeEqual } from 'crypto'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { runSeed } from '@/seed'

/**
 * One-time, protected seed trigger for serverless deploys (Vercel).
 *
 * The schema itself is created automatically by the postgres adapter's
 * `prodMigrations` at init. This route runs the (idempotent) DEMO/data seed —
 * super-admin, sites, roles, menus, and the rich demo content — which is too
 * heavy to run inside `onInit` (it would block every cold-start request). It
 * lives in the `(frontend)` group (served at top-level `GET /seed`) so it sits
 * OUTSIDE the admin IP guard (`src/proxy.ts` only matches `/admin` + `/api`),
 * exactly like `/health`.
 *
 * ## Gated twice
 *   1. `SEED_ON_DEPLOY` must be truthy (the operator's kill switch — set it to
 *      `false` after seeding to disable this route entirely).
 *   2. The `x-seed-key` REQUEST HEADER must equal `SEED_TRIGGER_TOKEN` (or, if
 *      that is unset, `PAYLOAD_SECRET`), compared in constant time. The token is
 *      taken from a header — never the query string — so it is not written to
 *      access logs, browser history, or `Referer`. Prefer setting a dedicated
 *      `SEED_TRIGGER_TOKEN` so a leak of this token never compromises the JWT
 *      signing secret.
 *
 * Idempotent: safe to hit more than once (find-before-create). If it times out
 * on a large seed, just call it again — completed steps are skipped and it
 * resumes.
 *
 * Usage after a deploy:
 *   curl -H "x-seed-key: $SEED_TRIGGER_TOKEN" https://<host>/seed
 * then set `SEED_ON_DEPLOY=false` (this route refuses once it is false).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isTruthy(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
}

/** Length-guarded constant-time string comparison (avoids timing side channels). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function GET(request: Request): Promise<Response> {
  if (!isTruthy(process.env.SEED_ON_DEPLOY)) {
    return Response.json(
      {
        ok: false,
        message: 'Seeding is disabled. Set SEED_ON_DEPLOY=true (Production), redeploy, then retry.',
      },
      { status: 403 },
    )
  }

  const provided = request.headers.get('x-seed-key') ?? ''
  const expected = process.env.SEED_TRIGGER_TOKEN || process.env.PAYLOAD_SECRET || ''
  if (!expected || !safeEqual(provided, expected)) {
    return Response.json(
      { ok: false, message: 'Invalid or missing x-seed-key header.' },
      { status: 403 },
    )
  }

  try {
    const payload = await getPayload({ config: configPromise })
    await runSeed(payload)
    return Response.json({
      ok: true,
      message: 'Seed complete (idempotent). Set SEED_ON_DEPLOY=false to disable this route.',
    })
  } catch (err) {
    // Log the detail server-side (Vercel runtime logs); never reflect internal
    // error text — incl. DB/connection strings — to the unauthenticated network.
    console.error('[seed] seed run failed:', err)
    return Response.json(
      { ok: false, message: 'Seed failed. Check the server (deployment) logs for details.' },
      { status: 500 },
    )
  }
}
