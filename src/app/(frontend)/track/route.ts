import { resolveClientIp } from '@/security/adminIpEnforcement'
import { enforceRateLimit, PUBLIC_ENDPOINT_NAMES } from '@/security/rateLimit'
import { getActiveSite, getPayloadClient } from '@/site/rsc'
import { recordPageView } from '@/site/traffic'

/**
 * Public traffic beacon (Task 4E; TODO 4.9). A `(frontend)` route handler — so
 * it is NOT under `/api/*` and never subject to the admin IP guard — that
 * records one PRIVACY-CONSCIOUS page view (see `src/site/traffic.ts` /
 * `PageViews.ts`: NO raw IP/PII stored). Called by the `<TrafficBeacon>` client
 * component on each page load/navigation via `navigator.sendBeacon`.
 *
 * Rate-limited (the trusted-proxy keying), and always returns `204 No Content`
 * so a capture failure is invisible to (and never blocks) the visitor.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceRateLimit({ headers: request.headers }, PUBLIC_ENDPOINT_NAMES.trackView)
  if (limited) {
    return limited
  }

  let path = '/'
  let referrer: string | null = null
  try {
    const body = (await request.json()) as { path?: unknown; referrer?: unknown }
    if (typeof body.path === 'string') {
      path = body.path
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
    await recordPageView(payload, {
      tenantId: site.id,
      path,
      userAgent: request.headers.get('user-agent'),
      referrer,
      clientIp: client.trusted ? client.ip : null,
    })
  }

  return new Response(null, { status: 204 })
}
