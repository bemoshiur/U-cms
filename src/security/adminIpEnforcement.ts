import type { Payload } from 'payload'

import { recordAccess } from '../audit/recordAccess'
import { isIpAllowedForAdmin } from './ipAccessGuard'

// Re-exported from the shared, dependency-free `clientIp` module (Task 7A #5).
// These stay importable from `@/security/adminIpEnforcement` so the existing
// call sites (proxy, /track, satisfaction + survey actions, rateLimit) are
// unchanged; the single implementation now also backs the audit-log IP capture.
export {
  getTrustedProxyHops,
  normalizeIp,
  resolveClientIp,
  type ResolvedClientIp,
} from './clientIp'
import type { ResolvedClientIp } from './clientIp'

/**
 * Request-level wiring for the admin IP access control (Task 2C Part 2). This
 * module is the trust-model + DB-backed decision + denial-audit layer;
 * `src/proxy.ts` is the thin Next.js entry point that calls it. Kept separate
 * from the proxy so the whole decision is unit/integration-testable without a
 * running HTTP server (see `tests/int/adminIpAccess.int.spec.ts`).
 *
 * ## Trust model (security-review fix, HIGH)
 *
 * `X-Forwarded-For` / `X-Real-IP` are client-controllable, so trusting the
 * leftmost XFF hop lets an attacker spoof an allowlisted IP. Enforcement
 * therefore only trusts a client IP when the operator declares how many proxy
 * hops sit in front of the app via `TRUSTED_PROXY_HOPS` (integer, default 0):
 *
 *  - `TRUSTED_PROXY_HOPS=N (N>0)` → take the **Nth-from-the-right** XFF entry
 *    (the address your own trusted proxy appended), which a client cannot forge
 *    by prepending extra entries.
 *  - `TRUSTED_PROXY_HOPS=0` → there is NO trustworthy IP source. Enforcement
 *    must not honor a spoofable header, so when the allowlist is ARMED it FAILS
 *    CLOSED in production (503 + recovery instructions) and stays permissive in
 *    development (so localhost dev is never bricked). An UNARMED allowlist
 *    (empty / all-inactive) never blocks either way (bootstrap net).
 */

/** The menuKey gating the `adminIpRules` collection (also tagged on denial logs). */
export const IP_ACCESS_MENU_KEY = 'system.ipAccessControl'

/**
 * Escape hatch (bootstrap/recovery). `ADMIN_IP_ENFORCEMENT=off` (also
 * `false`/`0`/`no`) fully bypasses the guard — the documented way to recover
 * admin access if a misconfigured allowlist (or a missing trusted-proxy config)
 * locks everyone out, without touching the database. Checked before Payload is
 * even loaded, so it works even if the database is down.
 */
export function isAdminIpEnforcementDisabled(): boolean {
  const raw = (process.env.ADMIN_IP_ENFORCEMENT ?? '').trim().toLowerCase()
  return raw === 'off' || raw === 'false' || raw === '0' || raw === 'no'
}

/** True only in a real production runtime (`NODE_ENV=production`). */
function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production'
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
 * reset/unlock, the static 2FA setup guide, and the public media FILE route.
 *
 * SECURITY (Task 4-zero, closes phase-3-final-review §2-B2): `/api/media/file/*`
 * is the DELIBERATE public path for genuinely-public display assets (site logos,
 * banner/popup images) that the public site renders unauthenticated. Re-exempting
 * it is safe ONLY because Task 4-zero moved every access-controlled attachment
 * OUT of `media` into the tenant-scoped `attachments` collection: `media` now
 * holds public assets only, so this route can never serve a private/secret/
 * cross-tenant file. Note two guardrails that keep the B2 hole shut:
 *   - Only the FILE route is exempt, NOT `/api/media` (the collection list stays
 *     guarded — no anonymous enumeration of the pool).
 *   - `/api/attachments` and `/api/attachments/file/*` are deliberately NOT here:
 *     attachment reads stay GUARDED and tenant-gated, and downloads go through
 *     the `canDownloadPost`-gated `/api/files/download`. Never add an
 *     `/api/attachments` prefix to this list.
 */
const EXEMPT_API_PREFIXES = [
  '/api/account-request',
  '/api/find-id',
  '/api/find-password',
  '/api/users/forgot-password',
  '/api/users/reset-password',
  '/api/users/unlock',
  '/api/2fa/guide',
  // Public display-asset file route (Task 4-zero). Serves ONLY public assets
  // (logos, banner/popup images) now that all access-controlled attachments
  // live in the tenant-scoped `attachments` collection. See Media.ts.
  '/api/media/file',
  // Managed attachment download (Task 4B seam #4). Exempt so a logged-in public
  // MEMBER can download a non-secret post's attachment. Safe because
  // `canDownloadPost` (src/endpoints/fileDownload.ts) is the sole gate and
  // DENIES anonymous requests + secret/cross-tenant files — the exemption drops
  // only the network allowlist, never the visibility check. Note this is the
  // `/api/files/download` endpoint ONLY; the raw `/api/attachments/file/*` route
  // stays GUARDED (see the guardrails note below) — never add `/api/attachments`.
  '/api/files/download',
  // Public short-URL redirect (Task 3D; refs 1-42/1-43). `GET /api/s/:code`
  // 302s an anonymous visitor to the stored (re-validated) target, so it must
  // stay reachable regardless of the admin IP allowlist — like the public
  // account-request flow. The pretty `GET /s/:code` path (the Next.js route
  // handler) is already outside `/admin`/`/api` and thus never guarded; this
  // exempts the `/api` variant. The redirect re-validates its target, so
  // exempting it cannot become an open redirect. See src/endpoints/shortUrlRedirect.ts.
  '/api/s',
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

export type AdminIpEvaluation = {
  allowed: boolean
  /** HTTP status the proxy should return when `allowed` is false (403 or 503). */
  status: number
  reason: string
  clientIp?: string
}

const ALLOW = (reason: string, clientIp?: string): AdminIpEvaluation => ({
  allowed: true,
  status: 200,
  reason,
  clientIp,
})

/** Denial audit — isolated so an audit-write failure can never flip the access decision. */
async function recordDenial(
  payload: Payload,
  pathname: string,
  clientIp: string | undefined,
  reason: string,
): Promise<void> {
  try {
    await recordAccess(payload, {
      action: 'denied',
      ipAddress: clientIp,
      url: pathname,
      menuKey: IP_ACCESS_MENU_KEY,
      menuLabel: `Admin access blocked by IP access control (${reason})`,
      linkActor: false,
    })
  } catch {
    /* recordAccess already swallows; belt-and-braces so we never throw here */
  }
}

/**
 * The full request decision used by the proxy AND the tests. Deliberate,
 * consistent failure behavior (security-review fix, MEDIUM):
 *
 *  - KNOWN-SAFE states → ALLOW: enforcement disabled, exempt path, no admin
 *    site configured, unarmed allowlist (empty / all-inactive), or an untrusted
 *    request in development.
 *  - DENY (audited): a trusted IP rejected by the rules → 403; an armed
 *    allowlist with no trustworthy IP in production → 503; the guard genuinely
 *    threw while evaluating rules (UNKNOWN state) → 503 fail-closed.
 *
 * The denial audit runs OUTSIDE the decision `try`, so a failed audit write can
 * never turn a deny into an allow (or vice-versa). Payload-load failures are
 * handled by the proxy with the same fail-closed posture.
 */
export async function evaluateAdminIpRequest(args: {
  payload: Payload
  pathname: string
  client: ResolvedClientIp
  now?: Date
}): Promise<AdminIpEvaluation> {
  const { payload, pathname, client } = args

  if (isAdminIpEnforcementDisabled()) {
    return ALLOW('enforcement-disabled', client.ip)
  }
  if (classifyAdminPath(pathname) === 'exempt') {
    return ALLOW('exempt-path', client.ip)
  }

  let deny: { status: number; reason: string } | null = null

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
      // KNOWN-SAFE: no admin site configured yet → cannot scope an allowlist.
      return ALLOW('no-admin-site', client.ip)
    }

    const decision = await isIpAllowedForAdmin(
      payload,
      client.trusted ? client.ip : undefined,
      site.id,
      args.now,
    )

    if (client.trusted) {
      // We have a trustworthy IP → honor the rule decision directly.
      if (decision.allowed) {
        return ALLOW(decision.reason, client.ip)
      }
      deny = { status: 403, reason: decision.reason }
    } else if (!decision.armed) {
      // KNOWN-SAFE: unarmed allowlist never blocks (bootstrap net).
      return ALLOW('unarmed-open', undefined)
    } else if (decision.unrestricted) {
      // KNOWN-SAFE (Task TR2 Part 4): the active ruleset is effectively
      // unrestricted (only bare-`*` allow rules, no block/specific rules), so it
      // grants EVERY IP anyway — admitting this unresolved IP opens nothing that
      // wasn't already open. Allow instead of 503-bricking a demo (e.g. the
      // seeded `*` allow on Vercel with TRUSTED_PROXY_HOPS unset). A genuinely
      // restrictive ruleset has `unrestricted === false` and still fails closed.
      return ALLOW('unrestricted-open', undefined)
    } else if (isProductionRuntime()) {
      // Armed, genuinely-restrictive allowlist, no trustworthy IP, production →
      // FAIL CLOSED (protection preserved).
      deny = { status: 503, reason: 'no-trusted-ip-fail-closed' }
    } else {
      // Dev: permissive so localhost is never bricked.
      return ALLOW('no-trusted-ip-dev-permissive', undefined)
    }
  } catch (err) {
    // UNKNOWN state — the guard threw during evaluation. FAIL CLOSED (503).
    payload?.logger?.error?.({ err }, '[ip-access] guard evaluation error — failing closed (503)')
    deny = { status: 503, reason: 'guard-error-fail-closed' }
  }

  // Exactly one deny path reaches here. Audit OUTSIDE the decision try.
  await recordDenial(payload, pathname, client.ip, deny.reason)
  return { allowed: false, status: deny.status, reason: deny.reason, clientIp: client.ip }
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

/**
 * 503 HTML for the fail-closed states (armed allowlist but no trustworthy client
 * IP, or an internal guard error). Carries the operator recovery instructions.
 */
export function renderFailClosedHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin temporarily unavailable</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 620px; margin: 12vh auto; padding: 0 24px; color: #18181b; line-height: 1.6; }
      h1 { font-size: 1.4rem; margin-bottom: .5rem; }
      code { background: #f4f4f5; padding: 1px 6px; border-radius: 4px; }
      p { color: #52525b; }
    </style>
  </head>
  <body>
    <h1>Admin temporarily unavailable</h1>
    <p>The admin IP access control could not securely determine your network, so access is being denied to protect the site.</p>
    <p>Operators: put the app behind a trusted reverse proxy and set <code>TRUSTED_PROXY_HOPS</code> to the number of proxy hops in front of it, or temporarily set <code>ADMIN_IP_ENFORCEMENT=off</code> to disable IP restriction while you reconfigure.</p>
  </body>
</html>`
}
