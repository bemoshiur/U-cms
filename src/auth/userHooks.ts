import type {
  CollectionBeforeValidateHook,
  CollectionBeforeLoginHook,
  CollectionBeforeOperationHook,
  CollectionAfterLoginHook,
  PayloadRequest,
} from 'payload'
import { APIError } from 'payload'

import { recordLoginSuccessAudit } from '../audit/authHooks'
import { validatePassword } from './validatePassword'

/**
 * User (admin account) auth-lifecycle hooks for Task 1D. Three concerns,
 * kept together because they all hang off the same collection:
 *
 *  1. `enforcePasswordPolicy` — password composition policy (ref 3-9).
 *  2. `blockInactiveLogin`   — only `status: active` accounts may authenticate.
 *  3. `recordLastLogin`      — stamps `lastLoginAt` for the dormancy sweep.
 */

/**
 * Resolves the login identifier used by the password "must not contain the
 * login ID" check: prefer the (new or existing) `loginId`, else the email.
 * `data`/`originalDoc` are loosely typed because Payload's hook `data` is a
 * partial `JsonObject`, not the generated collection type.
 */
function resolveLoginId(
  data: Record<string, unknown> | undefined,
  originalDoc: Record<string, unknown> | undefined,
): string | undefined {
  const candidates = [data?.loginId, originalDoc?.loginId, data?.email, originalDoc?.email]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      // For an email, the local-part is the meaningful "login-ID-like" token.
      return candidate.includes('@') ? candidate.split('@')[0] : candidate
    }
  }
  return undefined
}

/**
 * Enforces the fixed legacy password policy (see `validatePassword`) whenever
 * a password is being set/changed.
 *
 * ## Why a `beforeValidate` collection hook (and not a field `validate`)
 *
 * Payload 3.86 has NO per-collection override for the built-in `password`
 * field validator: `generatePasswordSaltHash`
 * (`node_modules/payload/dist/auth/strategies/local/generatePasswordSaltHash.js`)
 * calls the hard-coded `password()` validator from `fields/validations.js`
 * directly, with no hook into a collection-supplied validator. The plaintext
 * password IS, however, present as `data.password` in both the create and
 * update flows *before* it is hashed (verified against
 * `collections/operations/create.js` and
 * `collections/operations/utilities/update.js`: `beforeValidate`/`beforeChange`
 * collection hooks run while `data.password` is still the plaintext, ahead of
 * `registerLocalStrategy`/`generatePasswordSaltHash`). So a `beforeValidate`
 * collection hook is the supported enforcement point — documented per the
 * brief's "verify the actual hook in this version" instruction.
 *
 * Runs on both `create` and `update`; a no-op when no password is supplied
 * (e.g. a profile-only edit, or the many non-password updates elsewhere).
 */
export const enforcePasswordPolicy: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const password = data?.password
  if (typeof password !== 'string' || password.length === 0) {
    return data
  }

  const result = validatePassword(password, {
    userId: resolveLoginId(
      data as Record<string, unknown> | undefined,
      originalDoc as Record<string, unknown> | undefined,
    ),
  })
  if (result !== true) {
    // 400 so the message surfaces to the caller (admin UI / account-request).
    throw new APIError(result, 400)
  }

  return data
}

/**
 * Resolves the login identifier from a user doc fetched during a reset, for the
 * password "must not contain the login ID" check. Mirrors {@link resolveLoginId}
 * but reads a single loaded doc (the reset flow has no `data`/`originalDoc`
 * pair at the `beforeOperation` seam).
 */
function resolveLoginIdFromUser(
  user: Record<string, unknown> | null | undefined,
): string | undefined {
  for (const candidate of [user?.loginId, user?.email]) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate.includes('@') ? candidate.split('@')[0] : candidate
    }
  }
  return undefined
}

/**
 * Best-effort login-ID lookup by reset token. A failure here must NEVER block a
 * legitimate reset, so it degrades to skipping only the "contains login ID"
 * sub-check — the length/character-class/sequence checks still apply.
 */
async function resolveResetLoginId(
  req: PayloadRequest,
  token: unknown,
): Promise<string | undefined> {
  if (typeof token !== 'string' || token.length === 0) {
    return undefined
  }
  try {
    const user = await req.payload.db.findOne({
      collection: 'users',
      req,
      where: { resetPasswordToken: { equals: token } },
    })
    return resolveLoginIdFromUser(user as Record<string, unknown> | null)
  } catch {
    return undefined
  }
}

/**
 * Enforces the password policy on Payload's built-in reset-password flow
 * (carried Phase 1 I-3 — the last open gap). The public find-password recovery
 * path (T1D) drives exactly this flow, so without this a user resetting via the
 * emailed link could set a policy-violating password.
 *
 * ## Why this is a `beforeOperation` hook, and why `enforcePasswordPolicy`
 * (the `beforeValidate` hook) does NOT cover reset
 *
 * `resetPasswordOperation`
 * (`node_modules/payload/dist/auth/operations/resetPassword.js`) hashes
 * `data.password` into `user.hash` / `user.salt` FIRST, then runs the
 * `beforeValidate` COLLECTION hooks with `data: user` — by which point the
 * plaintext password is gone, so `enforcePasswordPolicy` (which keys off
 * `data.password`) legitimately no-ops. The plaintext is only present as
 * `args.data.password` on the INCOMING operation args, before hashing.
 * `buildBeforeOperation` feeds those args through every `beforeOperation`
 * collection hook (with `operation: 'resetPassword'`) at the very top of the
 * operation — the one supported 3.86 seam where the plaintext reset password is
 * still available. This single seam covers all reset entry points, since they
 * all funnel through `resetPasswordOperation`: the public
 * `/api/find-password` → forgotPassword → emailed reset link, the REST
 * `POST /api/users/reset-password`, and the admin reset view.
 *
 * A no-op for every non-reset operation and when no password is supplied (the
 * core operation raises its own "Missing required data." for that case).
 */
export const enforcePasswordPolicyOnReset: CollectionBeforeOperationHook = async (arg) => {
  if (arg.operation !== 'resetPassword') {
    return
  }

  const data = (arg.args as { data?: { password?: unknown; token?: unknown } } | undefined)?.data
  const password = data?.password
  if (typeof password !== 'string' || password.length === 0) {
    return
  }

  const result = validatePassword(password, {
    userId: await resolveResetLoginId(arg.req, data?.token),
  })
  if (result !== true) {
    throw new APIError(result, 400)
  }
}

/**
 * Gates authentication on the admin-account lifecycle `status` (ref 1-16
 * 상태). Only `active` accounts may log in; `pending`/`dormant`/`locked` throw
 * a clear, status-specific error.
 *
 * This is independent of Payload's native `maxLoginAttempts`/`lockTime`
 * lock (a transient brute-force lock that clears itself after `lockTime`);
 * this `status` gate is the *business* lifecycle (approval, dormancy). The
 * two are deliberately kept separate — see the doc comment on the `status`
 * field in `src/collections/Users.ts`.
 *
 * `beforeLogin` runs only after Payload has already verified the password and
 * the native unlock check (confirmed in `auth/operations/login.js`), so a
 * throw here aborts an otherwise-successful login.
 */
export const blockInactiveLogin: CollectionBeforeLoginHook = ({ user }) => {
  const status = (user as { status?: string } | undefined)?.status

  if (status === 'active') {
    return user
  }

  switch (status) {
    case 'pending':
      throw new APIError('This account is awaiting administrator approval.', 403)
    case 'dormant':
      throw new APIError(
        'This account is dormant due to inactivity — contact an administrator.',
        403,
      )
    case 'locked':
      throw new APIError('This account is locked.', 403)
    default:
      // Unknown/undefined status (e.g. a legacy doc predating this field):
      // fail closed — only `active` is allowed to authenticate.
      throw new APIError('This account is not active — contact an administrator.', 403)
  }
}

/**
 * Successful-login hook (extended for Task 2A). Three concerns:
 *
 *  1. Stamps `lastLoginAt` for the dormancy sweep (`markDormantAccounts`).
 *     `lastLoginAt`'s own field access forbids client writes, so this update
 *     uses `overrideAccess: true`; it runs inside the login transaction (`req`
 *     passed through) and carries no password, so `enforcePasswordPolicy` is a
 *     no-op. `context.skipAudit` is set around this update so the audit
 *     backbone does NOT log it as a generic `update` — the login is already
 *     captured as a dedicated `login` event below.
 *  2. Writes a `login` `accessLogs` row (refs 1-55/3-1).
 *  3. Writes a success `loginHistory` row (ref 3-7).
 *
 * Steps 2–3 are transaction-isolated and never throw (see the audit writers),
 * so login can never be broken by an audit failure.
 */
export const recordLastLogin: CollectionAfterLoginHook = async ({ req, user }) => {
  const sessionLoginAt = new Date().toISOString()

  const previousSkip = req.context?.skipAudit
  if (req.context) {
    req.context.skipAudit = true
  }
  try {
    await req.payload.update({
      collection: 'users',
      id: user.id,
      data: { lastLoginAt: sessionLoginAt },
      overrideAccess: true,
      req,
    })
  } finally {
    if (req.context) {
      req.context.skipAudit = previousSkip
    }
  }

  // Audit the login itself (isolated + non-throwing). Defensively wrapped so a
  // login can never be broken by the audit path, per the Task 2A contract.
  try {
    await recordLoginSuccessAudit(req, user as unknown as Record<string, unknown>, sessionLoginAt)
  } catch (err) {
    req.payload?.logger?.error?.({ err }, '[audit] login audit failed — swallowed to protect login')
  }

  return user
}
