import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import {
  classifyAdminPath,
  evaluateAdminIpRequest,
  isAdminIpEnforcementDisabled,
  renderBlockedHtml,
  resolveClientIp,
} from './security/adminIpEnforcement'

/**
 * Admin IP access control enforcement point (Task 2C Part 2; feature-inventory
 * ref 1-21).
 *
 * ## Why this is `proxy.ts`, not `middleware.ts`, and why that matters here
 *
 * Next.js 16 renamed `middleware.ts` → `proxy.ts`. Crucially, the `proxy`
 * runtime is **Node.js** (the deprecated `middleware` was Edge). That is the
 * whole reason a DB-backed allowlist can live here at all: this file can call
 * `getPayload()` and query Postgres directly, which an Edge middleware could
 * never do. It is the single choke point every `/admin/*` and `/api/*` request
 * passes through before Payload's route handlers run — so it can block a
 * disallowed IP *before* the admin UI or API does any work, and return a clean
 * 403 instead of letting a downstream `Forbidden` crash the page.
 *
 * ## What it deliberately does NOT touch
 *
 * The `matcher` scopes it to `/admin/*` and `/api/*` only, so the public
 * frontend (served from the `(frontend)` route group at `/…`) is never seen
 * here. Within the matched space, `classifyAdminPath` further exempts the
 * public account/recovery flows and public media serving (see
 * `adminIpEnforcement.ts`) so a locked-out user can still recover and the
 * frontend's images still load.
 *
 * ## Bootstrap / lockout safety
 *
 *  - `ADMIN_IP_ENFORCEMENT=off` short-circuits before Payload is even loaded.
 *  - Exempt paths short-circuit before Payload is loaded (keeps recovery cheap
 *    and always reachable).
 *  - `evaluateAdminIpRequest` treats an empty ruleset / missing admin site /
 *    any internal error as ALLOW (fail-open) — an internal fault must never
 *    brick the admin.
 */
export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
}

export async function proxy(request: NextRequest): Promise<Response> {
  // Cheap, Payload-free pre-checks: never load the CMS for disabled enforcement
  // or an exempt path (public recovery flows, media serving, etc.).
  if (isAdminIpEnforcementDisabled()) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl
  if (classifyAdminPath(pathname) === 'exempt') {
    return NextResponse.next()
  }

  const clientIp = resolveClientIp(request.headers)

  // Guarded path — load Payload (cached after first call) and evaluate.
  const { getPayload } = await import('payload')
  const { default: payloadConfig } = await import('@payload-config')
  const payload = await getPayload({ config: payloadConfig })

  const result = await evaluateAdminIpRequest({ payload, pathname, clientIp })
  if (result.allowed) {
    return NextResponse.next()
  }

  // Browser navigations get a readable 403 page; API/XHR callers get JSON in
  // Payload's `{ errors: [...] }` shape so the admin's fetch layer surfaces it.
  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('text/html')) {
    return new NextResponse(renderBlockedHtml(clientIp), {
      status: result.status,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return NextResponse.json(
    { errors: [{ message: 'Access denied: your IP address is not on the admin allowlist.' }] },
    { status: result.status },
  )
}
