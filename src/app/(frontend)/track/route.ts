import { normalizePath } from '@/content/traffic'
import { resolveClientIp } from '@/security/adminIpEnforcement'
import { enforceTrackRateLimit } from '@/security/rateLimit'
import { getActiveSite, getPayloadClient } from '@/site/rsc'
import { recordPageView } from '@/site/traffic'
import { buildTrackDedupKey, getTrafficDedup } from '@/site/trafficDedup'

/**
 * Public traffic beacon (Task 4E; TODO 4.9; hardened in Task 5A Part 0 / D6). A
 * `(frontend)` route handler — so NOT under `/api/*` and never subject to the
 * admin IP guard — that records one PRIVACY-CONSCIOUS page view (see
 * `src/site/traffic.ts` / `PageViews.ts`: NO raw IP/PII stored; the path is
 * canonicalized to the site's REAL routes, unknown → `__other__`). Called by the
 * `<TrafficBeacon>` client component on each page load/navigation.
 *
 * ## D6 hardening
 *  - a DEDICATED, much higher rate limit ({@link enforceTrackRateLimit}) — page
 *    views are frequent, so the strict abuse-flow cap would drop honest traffic;
 *  - per-(session, path) DEDUP ({@link getTrafficDedup}) — within a short window
 *    a single client can't inflate a page's counts by re-firing the beacon.
 *
 * Always returns `204 No Content` so a capture skip/failure is invisible to (and
 * never blocks) the visitor.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceTrackRateLimit({ headers: request.headers })
  if (limited) {
    return limited
  }

  let rawPath = '/'
  let referrer: string | null = null
  try {
    const body = (await request.json()) as { path?: unknown; referrer?: unknown }
    if (typeof body.path === 'string') {
      rawPath = body.path
    }
    if (typeof body.referrer === 'string') {
      referrer = body.referrer
    }
  } catch {
    // A malformed body is ignored — capture the bare path fallback below.
  }

  const site = await getActiveSite()
  if (site) {
    const client = resolveClientIp(request.headers)
    const clientIp = client.trusted ? client.ip : null
    const userAgent = request.headers.get('user-agent')

    // Per-(session, path) dedup BEFORE any DB work — a re-fire of the same page
    // by the same client within the window is dropped, so it can't inflate
    // counts (and saves the write). Keyed on the normalized path (the canonical
    // form is resolved inside recordPageView; normalizing here is enough to fold
    // query/fragment noise for dedup purposes).
    const dedupKey = buildTrackDedupKey(clientIp, userAgent, normalizePath(rawPath))
    if (getTrafficDedup().shouldRecord(dedupKey)) {
      const payload = await getPayloadClient()
      await recordPageView(payload, {
        tenantId: site.id,
        path: rawPath,
        userAgent,
        referrer,
        clientIp,
      })
    }
  }

  return new Response(null, { status: 204 })
}
