import type {
  CollectionAfterChangeHook,
  CollectionAfterErrorHook,
  CollectionBeforeChangeHook,
  CollectionBeforeLoginHook,
  PayloadRequest,
} from 'payload'
import { APIError } from 'payload'

import { extractLoginIdentifier } from '../audit/helpers'
import { recordAccess } from '../audit/recordAccess'
import { renderTwoFactorResetEmail } from '../email/authEmails'
import {
  generateTotpSecret,
  siteRequiresTwoFactor,
  TWO_FACTOR_INVALID_MESSAGE,
  TWO_FACTOR_LOCK_MS,
  TWO_FACTOR_LOCKED_MESSAGE,
  TWO_FACTOR_MAX_ATTEMPTS,
  TWO_FACTOR_REQUIRED_MESSAGE,
  verifyTotp,
} from './twoFactor'

/**
 * Task 2B — Google-OTP 2FA collection hooks + the carried I-2 session
 * revocation, all hanging off the `users` collection (see
 * `src/collections/Users.ts`).
 *
 * The security boundary is the `beforeLogin` gate (`require2FA`): Payload's
 * login operation runs inside a DB transaction and only issues the JWT/session
 * AFTER every `beforeLogin` hook resolves (verified in
 * `node_modules/payload/dist/auth/operations/login.js` — `addSessionToUser`
 * and `jwtSign` bracket the hook loop, and a throw triggers `killTransaction`,
 * rolling back the just-added session). So a throw here means NO session is
 * ever minted — the gate cannot be bypassed by calling `/api/users/login`
 * directly, which is the whole point.
 */

type UserRow = {
  id: number | string
  email?: string
  loginId?: string
  name?: string
  status?: string
  totpConfirmed?: boolean | null
  totpSecret?: string | null
  totpFailedAttempts?: number | null
  totpLockUntil?: string | null
}

/** Reads the submitted OTP from the login request body (`otp`, then `token`). */
function extractOtp(data: unknown): string {
  if (!data || typeof data !== 'object') {
    return ''
  }
  const record = data as Record<string, unknown>
  const raw = record.otp ?? record.token
  return typeof raw === 'string' ? raw.trim() : ''
}

/** True while the user's OTP step is locked out (throttle). */
function isOtpLocked(lockUntil: string | null | undefined): boolean {
  if (!lockUntil) {
    return false
  }
  const until = new Date(lockUntil).getTime()
  return Number.isFinite(until) && until > Date.now()
}

/** True when this request targets the login endpoint (REST/GraphQL). */
function isLoginRequest(req: PayloadRequest | undefined): boolean {
  let path = req?.pathname
  if (!path && typeof req?.url === 'string') {
    try {
      path = new URL(req.url).pathname
    } catch {
      path = undefined
    }
  }
  return typeof path === 'string' && /\/users\/login$/.test(path)
}

/**
 * `beforeLogin` 2FA gate. Runs after `blockInactiveLogin` (status gate), so it
 * only sees `active` users whose password already verified.
 *
 * Decision table (only when the back-office requires 2FA):
 *  - user has NOT confirmed a TOTP  → allow login (first-login enrolment path,
 *    ref 1-6: the QR is shown once on first login; a Phase-4 frontend gate then
 *    forces enrolment before further use — documented in task-2B-report.md).
 *  - user HAS confirmed a TOTP:
 *      - OTP step locked     → throw `TWO_FACTOR_LOCKED_MESSAGE` (429) even for
 *        a correct code (brute-force throttle — see `throttleTwoFactorFailure`).
 *      - no OTP supplied     → throw `TWO_FACTOR_REQUIRED_MESSAGE` (benign
 *        intermediate; `req.context.skipTwoFactorFailureLog` suppresses the
 *        failed-login audit row the `afterError` hook would otherwise write).
 *      - OTP invalid         → throw `TWO_FACTOR_INVALID_MESSAGE` (a real
 *        failure — audited, and counted toward the throttle, by `afterError`).
 *      - OTP valid           → reset the throttle counter and allow login.
 */
export const require2FA: CollectionBeforeLoginHook = async ({ req, user }) => {
  const u = user as unknown as UserRow

  if (!(await siteRequiresTwoFactor(req.payload, req))) {
    return user
  }

  // Not yet enrolled → let first login through so the QR can be shown once.
  if (!u.totpConfirmed || typeof u.totpSecret !== 'string' || u.totpSecret.length === 0) {
    return user
  }

  // Throttle: refuse the OTP step entirely while locked — a correct code must
  // NOT unlock early, or the lockout would be trivially bypassable.
  if (isOtpLocked(u.totpLockUntil)) {
    throw new APIError(TWO_FACTOR_LOCKED_MESSAGE, 429)
  }

  const otp = extractOtp(req.data)
  if (!otp) {
    // Correct password, code not yet entered — this is the step-1 → step-2
    // handoff, not a failed login. Flag it so `recordLoginFailure` skips it.
    if (req.context) {
      req.context.skipTwoFactorFailureLog = true
    }
    throw new APIError(TWO_FACTOR_REQUIRED_MESSAGE, 401)
  }

  if (!verifyTotp(otp, u.totpSecret)) {
    // The counter is incremented by `throttleTwoFactorFailure` on `afterError`,
    // which runs AFTER the login transaction is killed (so the write to this
    // user's row can't deadlock against the login's own row lock).
    throw new APIError(TWO_FACTOR_INVALID_MESSAGE, 401)
  }

  // Success: clear any accumulated failures so a user who fumbled a code (or
  // fixed their clock) isn't dragged toward a lock. `db.updateOne` writes only
  // these two scalar columns, inside the login transaction (via `req`), with no
  // hooks — safe against the row lock the login already holds (same tx).
  if (u.totpFailedAttempts || u.totpLockUntil) {
    try {
      await req.payload.db.updateOne({
        collection: 'users',
        id: u.id,
        data: { totpFailedAttempts: 0, totpLockUntil: null },
        req,
        returning: false,
      })
    } catch (err) {
      req.payload?.logger?.error?.(
        { err },
        '[2fa] reset of OTP throttle counter failed — swallowed',
      )
    }
  }

  return user
}

/**
 * OTP brute-force throttle (Task 2B fix). An `afterError` hook: it fires on the
 * REST/GraphQL login path (the external attack surface) AFTER the login
 * transaction has been killed (`killTransaction` runs inside the login
 * operation before the error propagates — verified in
 * `auth/operations/login.js`), so the user's row is no longer locked and this
 * isolated write cannot deadlock (the reason the increment can't live in the
 * `beforeLogin` gate: there the login tx still holds the row and a
 * throw would roll the increment back anyway).
 *
 * Only a genuinely WRONG code (`TWO_FACTOR_INVALID_MESSAGE`) counts — not the
 * benign "code required" intermediate, not a bad password, not a lockout bounce.
 * At `TWO_FACTOR_MAX_ATTEMPTS` consecutive misses it sets `totpLockUntil`
 * (`TWO_FACTOR_LOCK_MS`) and writes an accessLog; the wrong-code
 * `loginHistory` failure row is already written by `recordLoginFailure`.
 * The counter resets on a successful OTP (see `require2FA`).
 */
export const throttleTwoFactorFailure: CollectionAfterErrorHook = async ({
  collection,
  error,
  req,
}) => {
  try {
    if (collection?.slug !== 'users' || !isLoginRequest(req)) {
      return undefined
    }
    const message = error instanceof Error ? error.message : ''
    if (message !== TWO_FACTOR_INVALID_MESSAGE) {
      return undefined
    }

    // B1 (case-bypass fix): Payload stores emails lowercased and `equals` maps
    // to a case-sensitive Drizzle `eq`, so the throttle lookup MUST normalize
    // the attempted identifier exactly the way the login operation does
    // (`.toLowerCase().trim()`, mirroring `auth/operations/login.js`). Without
    // this, a mixed-case email (`Admin@Example.com`) matches no row here — the
    // failed-OTP counter is never written and the whole brute-force throttle is
    // silently disabled. Normalized at THIS call site rather than inside
    // `extractLoginIdentifier`, because the other caller (`recordLoginFailure`)
    // records the identifier verbatim for forensic fidelity (see helpers.ts).
    const identifier = extractLoginIdentifier(req)?.toLowerCase().trim()
    if (!identifier) {
      return undefined
    }

    const found = await req.payload.find({
      collection: 'users',
      where: { email: { equals: identifier } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const target = found.docs[0] as UserRow | undefined
    if (!target) {
      return undefined
    }

    const current = typeof target.totpFailedAttempts === 'number' ? target.totpFailedAttempts : 0
    const next = current + 1
    const locking = next >= TWO_FACTOR_MAX_ATTEMPTS

    // Isolated write (no `req`): the login tx is already rolled back, and the
    // counter must persist independently of it.
    await req.payload.db.updateOne({
      collection: 'users',
      id: target.id,
      data: {
        totpFailedAttempts: next,
        ...(locking
          ? { totpLockUntil: new Date(Date.now() + TWO_FACTOR_LOCK_MS).toISOString() }
          : {}),
      },
      returning: false,
    })

    if (locking) {
      await recordAccess(req.payload, {
        req,
        action: 'update',
        actor: target,
        linkActor: false,
        menuKey: 'system.admins',
        menuLabel: '2FA — OTP step locked (too many failed codes)',
        url: req?.pathname,
      })
    }
  } catch (err) {
    req?.payload?.logger?.error?.({ err }, '[2fa] OTP throttle update failed — swallowed')
  }
  return undefined
}

/**
 * `beforeChange` processor for the two admin-only reset actions (Part 4, ref
 * 1-16). Reads the transient `resetTwoFactorDevice` / `regenerateTwoFactorSecret`
 * action checkboxes, applies the corresponding TOTP field mutations to `data`,
 * and clears the checkboxes so they behave like one-shot buttons.
 *
 * Mutating `data` in a COLLECTION `beforeChange` hook persists even without
 * `overrideAccess`: field-level write access is enforced earlier, in the
 * `beforeValidate` field phase (confirmed in
 * `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js`), so these
 * writes to the access-locked `totpSecret`/`totpConfirmed` fields survive.
 * The action checkboxes themselves are gated on `system.admins` at the field
 * level, so only an admin can trigger a reset. `req.context.twoFactorReset`
 * carries the action to the `afterChange` notifier.
 */
export const processTwoFactorAdminReset: CollectionBeforeChangeHook = ({
  data,
  operation,
  req,
}) => {
  if (!data) {
    return data
  }

  const resetDevice = data.resetTwoFactorDevice === true
  const regenSecret = data.regenerateTwoFactorSecret === true

  // Always normalise the transient action flags back to false.
  data.resetTwoFactorDevice = false
  data.regenerateTwoFactorSecret = false

  // The actions are only meaningful on an existing account.
  if (operation !== 'update' || (!resetDevice && !regenSecret)) {
    return data
  }

  if (regenSecret) {
    data.totpSecret = generateTotpSecret()
  } else {
    data.totpSecret = null
  }
  data.totpConfirmed = false
  data.totpEnrolledAt = null

  if (req.context) {
    req.context.twoFactorReset = regenSecret ? 'secret' : 'device'
  }

  return data
}

/**
 * CARRIED I-2 — `beforeChange` session revocation (Part 5). When `status`
 * transitions to a non-active value (`locked`/`dormant`/`pending`), empty the
 * `sessions` array in the SAME write so every live JWT is invalidated
 * immediately: the JWT strategy rejects any token whose `sid` is no longer in
 * `user.sessions` (verified in
 * `node_modules/payload/dist/auth/strategies/jwt.js`), which also makes the
 * refresh endpoint fail — closing the Phase-1 gap where a lock/dormant flip
 * left existing sessions (and token refresh) alive until natural expiry.
 *
 * `req.context.sessionsRevoked` hands the event to the `afterChange` auditor.
 */
export const revokeSessionsOnStatusChange: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data || operation !== 'update') {
    return data
  }

  const previousStatus = (originalDoc as { status?: string } | undefined)?.status
  const nextStatus = typeof data.status === 'string' ? data.status : previousStatus

  if (nextStatus !== 'active' && nextStatus !== previousStatus) {
    data.sessions = []
    if (req.context) {
      req.context.sessionsRevoked = nextStatus
    }
  }

  return data
}

/** Resolves the best human label / recipient for a user row. */
function userEmail(doc: unknown): string | undefined {
  const email = (doc as { email?: unknown } | undefined)?.email
  return typeof email === 'string' && email.length > 0 ? email : undefined
}

/**
 * `afterChange` notifier for an admin 2FA reset: emails the affected user (ref
 * 1-16) and writes an `accessLog`. Reads the action stashed by
 * `processTwoFactorAdminReset`; isolated + non-throwing so a reset save is
 * never broken by a mail/audit hiccup.
 */
export const notifyTwoFactorReset: CollectionAfterChangeHook = async ({ doc, req }) => {
  const action = req.context?.twoFactorReset as 'device' | 'secret' | undefined
  if (!action) {
    return doc
  }
  if (req.context) {
    req.context.twoFactorReset = undefined
  }

  const to = userEmail(doc)
  try {
    if (to) {
      await req.payload.sendEmail({
        to,
        subject: 'Your Pulse CMS two-factor authentication was reset',
        html: renderTwoFactorResetEmail(),
      })
    }
  } catch (err) {
    req.payload?.logger?.error?.({ err }, '[2fa] reset notification email failed — swallowed')
  }

  await recordAccess(req.payload, {
    req,
    action: 'update',
    actor: doc,
    // Same-row self-reference: keep the identity via actorLabel only (see the
    // `linkActor` deadlock note in recordAccess.ts).
    linkActor: false,
    menuKey: 'system.admins',
    menuLabel:
      action === 'secret' ? '2FA — OTP secret regenerated by admin' : '2FA — device reset by admin',
    url: req?.pathname,
  })

  return doc
}

/**
 * `afterChange` auditor for the I-2 forced logout. Writes a `logout` accessLog
 * when `revokeSessionsOnStatusChange` cleared the sessions. Isolated +
 * non-throwing.
 */
export const auditForcedLogout: CollectionAfterChangeHook = async ({ doc, req }) => {
  const revokedTo = req.context?.sessionsRevoked as string | undefined
  if (!revokedTo) {
    return doc
  }
  if (req.context) {
    req.context.sessionsRevoked = undefined
  }

  await recordAccess(req.payload, {
    req,
    action: 'logout',
    actor: doc,
    linkActor: false,
    menuKey: 'system.admins',
    menuLabel: `Forced logout — status changed to ${revokedTo}`,
    url: req?.pathname,
  })

  return doc
}
