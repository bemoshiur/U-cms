import type {
  CollectionBeforeValidateHook,
  CollectionBeforeLoginHook,
  CollectionAfterLoginHook,
} from 'payload'
import { APIError } from 'payload'

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
 * Stamps `lastLoginAt` on successful login so the dormancy sweep
 * (`markDormantAccounts`) can find long-inactive accounts. `lastLoginAt`'s
 * own field access forbids client writes, so this update uses
 * `overrideAccess: true`; it runs inside the login transaction (`req` passed
 * through) and carries no password, so `enforcePasswordPolicy` is a no-op.
 */
export const recordLastLogin: CollectionAfterLoginHook = async ({ req, user }) => {
  await req.payload.update({
    collection: 'users',
    id: user.id,
    data: { lastLoginAt: new Date().toISOString() },
    overrideAccess: true,
    req,
  })
  return user
}
