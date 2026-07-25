import type { Payload } from 'payload'

import { normalizeIp } from '../audit/helpers'
import { recordAccess } from '../audit/recordAccess'
import { isIpAllowedForAdmin } from './ipAccessGuard'

/**
 * Request-level wiring for the admin IP access control (Task 2C Part 2). This
 * module is the DB-backed decision + denial-audit layer; `src/proxy.ts` is the
 * thin Next.js entry point that calls it. Kept separate from the proxy so the
 * whole decision (path classification, admin-site resolution, default-deny
 * guard, denial logging) is unit/integration-testable without a running HTTP
 * server (see `tests/int/adminIpAccess.int.spec.ts`).
 */

/** The menuKey gating the `adminIpRules` collection (also tagged on denial logs). */
export const IP_ACCESS_MENU_KEY = 'system.ipAccessControl'

/**
 * Escape hatch (bootstrap/recovery). `ADMIN_IP_ENFORCEMENT=off` (also
 * `false`/`0`/`no`) fully bypasses the guard — the documented way to recover
 * admin access if a misconfigured allowlist locks everyone out, without
 * touching the database. Any other value (including unset) leaves enforcement
 * ON; combined with "empty ruleset = open" and the seeded `*` allow, that is
 * still safe on a fresh/seeded install.
 */
export function isAdminIpEnforcementDisabled(): boolean {
  const raw = (process.env.ADMIN_IP_ENFORCEMENT ?? '').trim().toLowerCase()
  return raw === 'off' || raw === 'false' || raw === '0' || raw === 'no'
}

/**
 * Admin sub-paths that MUST stay reachable regardless of IP — the
 * unauthenticated recovery/self-service flows a legitimately locked-out or
 * off-network user needs (ref 1-1/1-3 Find-ID / Find-PW / account request),
 * plus logout so a blocked session can always clean itself up. `/admin/login`
 * is deliberately NOT here: under an IP allowlist the login screen itself is
 * restricted.
 */
const EXEMPT_ADMIN_PREFIXES = [
  '/admin/forgot',
  '/admin/reset',
  '/admin/find-id',
  '/admin/account-request',
  '/admin/unlock',
  '/admin/logout',
]

/**
 * API paths that MUST stay reachable regardless of IP: the public
 * account/recovery endpoints (Task 1D), Payload's built-in password
 * reset/unlock, the public media file serving used by the FRONTEND site, and
 * the static 2FA setup guide. Everything else under `/api` (login, `me`,
 * refresh-token, all collection REST, GraphQL) is guarded so a blocked IP can
 * neither authenticate nor read/write through the API.
 */
const EXEMPT_API_PREFIXES = [
  '/api/account-request',
  '/api/find-id',
  '/api/find-password',
  '/api/users/forgot-password',
  '/api/users/reset-password',
  '/api/users/unlock',
  '/api/media',
  '/api/2fa/guide',
]

export type PathClassification = 'guard' | 'exempt'

/**
 * Classifies a request path as `guard` (subject to the IP allowlist) or
 * `exempt`. Only `/admin/*` and `/api/*` are ever guarded; the public frontend
 * lives outside both and is never matched (see the proxy matcher).
 */
export function classifyAdminPath(pathname: string): PathClassification {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  const isAdmin = path === '/admin' || path.startsWith('/admin/')
  const isApi = path === '/api' || path.startsWith('/api/')
  if (!isAdmin && !isApi) {
    return 'exempt'
  }

  if (isAdmin && EXEMPT_ADMIN_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return 'exempt'
  }
  if (isApi && EXEMPT_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return 'exempt'
  }

  return 'guard'
}

/**
 * Resolves the client IP from proxy headers (first hop of `x-forwarded-for`,
 * then `x-real-ip`). Mirrors `resolveIpAddress` in the audit backbone but reads
 * a plain Web `Headers` (a `NextRequest` in the proxy has no `req.ip`). Returns
 * `undefined` when no proxy forwarded an address — which, per `ipMatches`, then
 * matches only a bare `*` rule.
 *
 * NOTE: this trusts the forwarding headers, so it is only as reliable as the
 * reverse proxy in front of the app. A direct (proxy-less) connection — e.g.
 * plain `localhost` dev — forwards nothing, so the IP is `undefined`; the
 * seeded `*` allow keeps such installs reachable until real rules are set.
 */
export function resolveClientIp(headers: Headers): string | undefined {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) {
      return normalizeIp(first)
    }
  }
  const realIp = headers.get('x-real-ip')
  if (realIp && realIp.trim()) {
    return normalizeIp(realIp.trim())
  }
  return undefined
}

export type AdminIpEvaluation = {
  allowed: boolean
  /** HTTP status the proxy should return when `allowed` is false. */
  status: number
  reason: string
  clientIp?: string
}

const ALLOWED: AdminIpEvaluation = { allowed: true, status: 200, reason: 'allowed' }

/**
 * The full request decision used by the proxy AND the tests: applies the escape
 * hatch, path classification, admin-site resolution and the default-deny guard,
 * and writes an `accessLogs` denial row (action `denied`, tagged with the
 * blocked IP) on refusal.
 *
 * Fails OPEN on any unexpected error (no admin site, guard/DB throw): the whole
 * point of this task is to *not* brick admin access, so an internal fault must
 * never turn into a lockout — it is logged and access is allowed.
 */
export async function evaluateAdminIpRequest(args: {
  payload: Payload
  pathname: string
  clientIp: string | undefined
  now?: Date
}): Promise<AdminIpEvaluation> {
  const { payload, pathname, clientIp } = args

  if (isAdminIpEnforcementDisabled()) {
    return { ...ALLOWED, reason: 'enforcement-disabled' }
  }
  if (classifyAdminPath(pathname) === 'exempt') {
    return { ...ALLOWED, reason: 'exempt-path' }
  }

  try {
    const adminSite = await payload.find({
      collection: 'sites',
      where: { isAdminSite: { equals: true } },
      limit: 1,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    const site = adminSite.docs[0]
    if (!site) {
      // No admin site configured yet → cannot scope an allowlist; stay open.
      return { ...ALLOWED, reason: 'no-admin-site' }
    }

    const decision = await isIpAllowedForAdmin(payload, clientIp, site.id, args.now)
    if (decision.allowed) {
      return { allowed: true, status: 200, reason: decision.reason, clientIp }
    }

    await recordAccess(payload, {
      action: 'denied',
      ipAddress: clientIp,
      url: pathname,
      menuKey: IP_ACCESS_MENU_KEY,
      menuLabel: 'Admin access blocked by IP access control',
      linkActor: false,
    })

    return { allowed: false, status: 403, reason: decision.reason, clientIp }
  } catch (err) {
    // Fail OPEN — never let an internal fault brick the admin.
    payload?.logger?.error?.(
      { err },
      '[ip-access] guard evaluation failed — allowing request (fail-open)',
    )
    return { ...ALLOWED, reason: 'guard-error-fail-open' }
  }
}

/** Minimal, self-contained 403 HTML for a blocked browser navigation to the admin. */
export function renderBlockedHtml(clientIp: string | undefined): string {
  const ip = clientIp && /^[0-9a-f:.]+$/i.test(clientIp) ? clientIp : 'unknown'
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Access denied</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 15vh auto; padding: 0 24px; color: #18181b; line-height: 1.6; }
      h1 { font-size: 1.4rem; margin-bottom: .5rem; }
      code { background: #f4f4f5; padding: 1px 6px; border-radius: 4px; }
      p { color: #52525b; }
    </style>
  </head>
  <body>
    <h1>Access denied</h1>
    <p>Administration for this site is restricted to approved networks. Your address <code>${ip}</code> is not on the allowlist.</p>
    <p>If you believe this is a mistake, contact your administrator to have your IP address added.</p>
  </body>
</html>`
}
