import { sql } from '@payloadcms/db-postgres'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

import pkg from '../../../../package.json'

/**
 * Lightweight, unauthenticated readiness probe for uptime monitors (Task 7E /
 * TODO 7.4). Served at `GET /health`.
 *
 * ## Why it lives in `(frontend)`, not `/api`
 *
 * The admin IP-access proxy (`src/proxy.ts`) only matches `/admin/:path*` and
 * `/api/:path*`. Placing this route in the `(frontend)` group — served at the
 * top-level `/health` — keeps it OUTSIDE that matcher, so an off-network uptime
 * checker (whose IP is never on the admin allowlist) is never blocked or served
 * a 503 by the guard. No change to the guard's exempt list is needed.
 *
 * ## Leaks nothing
 *
 * The body is only two booleans (`ok`, `db`) plus the app version — no stack, no
 * env, no request echo, no DB internals or error text. `db` is a trivial
 * `SELECT 1` against the same Postgres pool the app uses (the established
 * `payload.db.drizzle.execute(sql...)` seam), so a green response means the
 * process is up AND can reach its database. A failed ping is swallowed and
 * surfaced only as `db: false` + HTTP 503, so monitors flag it without learning
 * why.
 */
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const version = (pkg as { version?: string }).version ?? 'unknown'

  let dbOk = false
  try {
    const payload = await getPayload({ config: configPromise })
    await payload.db.drizzle.execute(sql`select 1`)
    dbOk = true
  } catch {
    dbOk = false
  }

  return Response.json(
    { ok: dbOk, db: dbOk, version },
    {
      status: dbOk ? 200 : 503,
      headers: { 'cache-control': 'no-store' },
    },
  )
}
