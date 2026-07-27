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
 *   2. `?key=` must equal `PAYLOAD_SECRET` (so it can't be triggered by a
 *      stranger during the SEED_ON_DEPLOY window).
 *
 * Idempotent: safe to hit more than once (find-before-create). If it times out
 * on a large seed, just call it again — completed steps are skipped and it
 * resumes.
 *
 * Usage after a deploy:
 *   curl "https://<host>/seed?key=$PAYLOAD_SECRET"
 * then set `SEED_ON_DEPLOY=false` and redeploy (or just leave it — the route
 * refuses once SEED_ON_DEPLOY is false).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isTruthy(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes' || v === 'on'
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

  const key = new URL(request.url).searchParams.get('key')
  const secret = process.env.PAYLOAD_SECRET
  if (!secret || key !== secret) {
    return Response.json({ ok: false, message: 'Invalid or missing key.' }, { status: 403 })
  }

  try {
    const payload = await getPayload({ config: configPromise })
    await runSeed(payload)
    return Response.json({
      ok: true,
      message: 'Seed complete (idempotent). Set SEED_ON_DEPLOY=false to disable this route.',
    })
  } catch (err) {
    return Response.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
