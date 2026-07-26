import { resolveClientIp } from '@/security/adminIpEnforcement'
import { enforceTrackRateLimit } from '@/security/rateLimit'
import { getActiveSite, getPayloadClient } from '@/site/rsc'
import { captureTrackedView } from '@/site/traffic'

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
 *  - per-(session, path) DEDUP keyed off the CANONICAL/stored bucket, inside
 *    {@link captureTrackedView} — within a short window a single client can't
 *    inflate a real page's counts (even via forged `/page/{n}/…garbage` bodies
 *    that all canonicalize to the same page, which a raw-path dedup key missed).
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
    const payload = await getPayloadClient()
    // captureTrackedView canonicalizes the path and dedups on that canonical
    // bucket BEFORE any DB write (D6) — see src/site/traffic.ts.
    await captureTrackedView(payload, {
      tenantId: site.id,
      path: rawPath,
      userAgent: request.headers.get('user-agent'),
      referrer,
      clientIp: client.trusted ? client.ip : null,
    })
  }

  return new Response(null, { status: 204 })
}
