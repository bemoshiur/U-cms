import { parseValidationMode } from '@/accessibility/validationMode'
import { resolveClientIp } from '@/security/adminIpEnforcement'
import { enforceAccessibilityRateLimit } from '@/security/rateLimit'
import { handleAccessibilityValidation } from '@/site/accessibilityValidation'
import { getActiveSite, getPayloadClient } from '@/site/rsc'

/**
 * Public accessibility-validation DB-store beacon (Phase 8, Task 8.2 / TODO 8.3).
 * A `(frontend)` route handler — so NOT under `/api/*` and never subject to the
 * admin IP guard — that the public `<AccessibilityValidator>` client component
 * POSTs to when the active site's validation mode is `db` / `popup_db`. It reads
 * the SITE'S mode (never trusts the request to decide) and only writes when the
 * mode stores; off / popup write nothing.
 *
 * Safety: a dedicated rate limit (spoof-proof keying) + per-(session,route) dedup
 * + server-derived, clamped counts (see `src/site/accessibilityValidation.ts`).
 * Legacy note (2-16 callout 5): web-accessibility validation "operates only in
 * local and development environments" — so a production request is a no-op even
 * if posted directly. Always returns `204` so a skip/failure never blocks the
 * visitor.
 */
export async function POST(request: Request): Promise<Response> {
  const limited = enforceAccessibilityRateLimit({ headers: request.headers })
  if (limited) {
    return limited
  }

  // Dev/local only (legacy behavior) — never persist in production.
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 204 })
  }

  let path = '/'
  let screenName = ''
  let axe: { violations?: unknown; passes?: unknown; incomplete?: unknown } = {}
  try {
    const body = (await request.json()) as {
      path?: unknown
      screenName?: unknown
      axe?: unknown
    }
    if (typeof body.path === 'string') path = body.path
    if (typeof body.screenName === 'string') screenName = body.screenName
    if (body.axe && typeof body.axe === 'object') {
      axe = body.axe as { violations?: unknown; passes?: unknown; incomplete?: unknown }
    }
  } catch {
    // Malformed body → nothing to store; fall through to the 204.
    return new Response(null, { status: 204 })
  }

  const site = await getActiveSite()
  if (site) {
    const mode = parseValidationMode(
      (site as { accessibilityValidation?: unknown }).accessibilityValidation,
    )
    const client = resolveClientIp(request.headers)
    const payload = await getPayloadClient()
    await handleAccessibilityValidation(payload, {
      mode,
      tenantId: site.id,
      route: path,
      screenName,
      axe,
      userAgent: request.headers.get('user-agent'),
      clientIp: client.trusted ? client.ip : null,
    })
  }

  return new Response(null, { status: 204 })
}
