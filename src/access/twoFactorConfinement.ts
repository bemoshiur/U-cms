import type { PayloadRequest } from 'payload'

import { siteRequiresTwoFactor } from '../auth/twoFactor'

/**
 * Server-side 2FA-enrolment confinement (Task 7D — P1; OWASP audit §3 P1).
 *
 * ## The defect this closes
 *
 * When the back-office requires 2FA but an admin has NOT yet confirmed a TOTP,
 * `require2FA` (src/auth/twoFactorHooks.ts) still lets the password-only login
 * through — it MUST, because the enrolment endpoints (`/api/2fa/enroll`,
 * `/api/2fa/verify-enroll`) need an authenticated `req.user` session to enrol.
 * Throwing at login would make enrolment impossible (bricking the mandate).
 *
 * The old posture stopped there: the frontend merely *nudged* enrolment, so a
 * direct REST/GraphQL caller holding that password-only session could perform
 * any admin operation. This helper makes the session **confined** server-side:
 * an un-enrolled `users` principal under a 2FA-required back-office is denied
 * every menu/tenant-gated collection operation at the access layer (covering
 * REST + GraphQL, not just the admin UI). The ONLY things it can still do:
 *   - call the 2FA enrolment endpoints — they use `overrideAccess: true`, so
 *     they bypass the access layer entirely and keep working;
 *   - read/update its OWN `users` record — `selfOrMenuAccess`'s self-branch
 *     returns before ever consulting `hasMenuAccess`, so self-access (needed to
 *     render the enrolment UI / `/api/users/me`) is untouched;
 *   - log out — Payload's logout op is not access-gated.
 * The moment `totpConfirmed` flips true, this returns false on the next request
 * and the confinement lifts automatically (every request re-fetches `req.user`
 * live via the JWT strategy — see the design note in hasMenuAccess.ts).
 *
 * ## Why this is checked in more than one access helper
 *
 * Most gated collections funnel through `hasMenuAccess`, so the guard there
 * covers them (and `tenantScopedMenuAccess`, which calls `hasMenuAccess` FIRST).
 * But three access helpers short-circuit on `isSuper` BEFORE calling
 * `hasMenuAccess` — `securityDocScopedAccess`, `securityDocAttachmentRead`
 * (src/access/securityDocs.ts) and `tenantMembershipAccess`
 * (src/access/tenantAccess.ts). Without an explicit guard there, an un-enrolled
 * *super*-admin (the seeded super the audit calls out) would bypass confinement
 * for boards/posts/attachments. So each of those calls this guard up-front too.
 *
 * ## Members are never affected
 *
 * Only `collection === 'users'` principals are ever confined; public-site
 * members (`collection === 'members'`) have no 2FA and are returned early.
 *
 * ## Cost / caching
 *
 * The `siteRequiresTwoFactor` lookup is cached per-request on `req.context` so a
 * row/field access check does not re-query `sites` (this runs in a hot access
 * path — an un-cached async call would become an N+1). In the demo (site 2FA
 * off) the cached lookup returns false on the first check of a request and the
 * function is inert for every subsequent check that request makes.
 */

const SITE_REQUIRES_2FA_CACHE_KEY = 'siteRequiresTwoFactor'
const TOTP_CONFIRMED_CACHE_KEY = 'twoFactorConfirmedResolved'

/** Per-request-cached `siteRequiresTwoFactor` (avoids re-querying `sites`). */
async function siteRequiresTwoFactorCached(req: PayloadRequest): Promise<boolean> {
  const ctx = req.context as Record<string, unknown> | undefined
  if (ctx && typeof ctx[SITE_REQUIRES_2FA_CACHE_KEY] === 'boolean') {
    return ctx[SITE_REQUIRES_2FA_CACHE_KEY] as boolean
  }
  const result = await siteRequiresTwoFactor(req.payload, req)
  if (ctx) {
    ctx[SITE_REQUIRES_2FA_CACHE_KEY] = result
  }
  return result
}

/**
 * Resolves whether the current `users` principal has confirmed a TOTP.
 *
 * On a real HTTP request `req.user` is re-fetched live by the JWT strategy at
 * the collection's `auth.depth`, so it carries the (unrestricted) `totpConfirmed`
 * field directly — the fast path. Only when the field is genuinely absent (a
 * shallow/synthetic Local-API `user` object) do we fall back to a single
 * per-request-cached `findByID`, rather than ASSUMING un-enrolled — which would
 * wrongly confine an already-enrolled admin whose caller passed a bare user.
 */
async function resolveTotpConfirmed(req: PayloadRequest, user: { id: unknown }): Promise<boolean> {
  const direct = (user as { totpConfirmed?: unknown }).totpConfirmed
  if (typeof direct === 'boolean') {
    return direct
  }

  const ctx = req.context as Record<string, unknown> | undefined
  if (ctx && typeof ctx[TOTP_CONFIRMED_CACHE_KEY] === 'boolean') {
    return ctx[TOTP_CONFIRMED_CACHE_KEY] as boolean
  }

  let confirmed = false
  try {
    const doc = await req.payload.findByID({
      collection: 'users',
      id: user.id as string | number,
      depth: 0,
      overrideAccess: true,
      req,
    })
    confirmed = (doc as { totpConfirmed?: unknown })?.totpConfirmed === true
  } catch {
    confirmed = false
  }
  if (ctx) {
    ctx[TOTP_CONFIRMED_CACHE_KEY] = confirmed
  }
  return confirmed
}

/**
 * True when the acting session is an admin `users` principal that must be
 * confined to the 2FA-enrolment surface: the back-office requires 2FA and this
 * principal has not confirmed a TOTP. Access helpers call this and DENY (return
 * `false`) when it is true. See the module doc comment for the full rationale.
 */
export async function isTwoFactorEnrolmentConfined(req: PayloadRequest): Promise<boolean> {
  const user = req.user as ({ id: unknown; collection?: unknown } & Record<string, unknown>) | null
  // Only admin `users` principals are ever confined; members are unaffected.
  if (!user || user.collection !== 'users') {
    return false
  }
  // Demo / 2FA-off fast path (cached): no site requires 2FA → never confined.
  if (!(await siteRequiresTwoFactorCached(req))) {
    return false
  }
  // 2FA required: confined until this principal has confirmed a TOTP.
  return !(await resolveTotpConfirmed(req, user))
}
