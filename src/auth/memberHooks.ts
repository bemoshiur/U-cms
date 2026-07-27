import type {
  CollectionBeforeChangeHook,
  CollectionBeforeLoginHook,
  CollectionBeforeValidateHook,
} from 'payload'
import { APIError } from 'payload'

import { validateMemberPassword } from './validateMemberPassword'

/**
 * Public-site MEMBER auth-lifecycle hooks (Task 4B). The member analogues of the
 * admin `users` hooks (`src/auth/userHooks.ts`) — kept in a separate module so
 * the two audiences never share enforcement code by accident (a member is a
 * different, lower-privilege identity; see task-4B-report.md).
 */

/**
 * Resolves the login identifier used by the member "password must not contain
 * the login ID" check: prefer the (new or existing) `loginId`, else the email
 * local-part. `data`/`originalDoc` are loosely typed because a hook's `data` is
 * a partial `JsonObject`, not the generated `Member` type.
 */
function resolveMemberLoginId(
  data: Record<string, unknown> | undefined,
  originalDoc: Record<string, unknown> | undefined,
): string | undefined {
  const candidates = [data?.loginId, originalDoc?.loginId, data?.email, originalDoc?.email]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate.includes('@') ? candidate.split('@')[0] : candidate
    }
  }
  return undefined
}

/**
 * Enforces the (lighter) member password policy whenever a member password is
 * set/changed. Same `beforeValidate` seam and rationale as the admin
 * `enforcePasswordPolicy`: Payload 3.86 has no per-collection override for the
 * built-in `password` validator, and `data.password` is still plaintext in both
 * the create and update flows before it is hashed. A no-op when no password is
 * supplied (e.g. a profile-only edit). Runs on both create and update.
 */
export const enforceMemberPasswordPolicy: CollectionBeforeValidateHook = ({
  data,
  originalDoc,
}) => {
  const password = data?.password
  if (typeof password !== 'string' || password.length === 0) {
    return data
  }
  const result = validateMemberPassword(password, {
    loginId: resolveMemberLoginId(
      data as Record<string, unknown> | undefined,
      originalDoc as Record<string, unknown> | undefined,
    ),
  })
  if (result !== true) {
    throw new APIError(result, 400)
  }
  return data
}

/**
 * Gates member authentication on `status` (refs 1-16 회원 상태). Only `active`
 * members may log in; `pending` (awaiting approval), `dormant` (long inactivity),
 * and `withdrawn` throw a clear, status-specific 403. Mirrors the admin
 * `blockInactiveLogin`; `beforeLogin` runs only after Payload has verified the
 * password + native lock, so a throw here aborts an otherwise-successful login.
 */
export const blockInactiveMemberLogin: CollectionBeforeLoginHook = ({ user }) => {
  const status = (user as { status?: string } | undefined)?.status
  if (status === 'active') {
    return user
  }
  switch (status) {
    case 'pending':
      throw new APIError('Your membership is awaiting approval.', 403)
    case 'dormant':
      throw new APIError(
        'This account is dormant due to inactivity. Please recover it to continue.',
        403,
      )
    case 'withdrawn':
      throw new APIError('This account has been withdrawn.', 403)
    default:
      // Unknown/undefined status → fail closed (only `active` authenticates).
      throw new APIError('This account is not active.', 403)
  }
}

/**
 * Member session revocation on status change (Task 7A #1b — the member analogue
 * of the admin `revokeSessionsOnStatusChange`, Phase 2 T2B). Members now use
 * server-side sessions (`useSessions: true`), so when `status` transitions AWAY
 * from `active` (→ `pending`/`dormant`/`withdrawn`) we empty the `sessions`
 * array in the SAME write. Payload's JWT strategy rejects any member token whose
 * `sid` is no longer in `user.sessions` (verified in
 * `node_modules/payload/dist/auth/strategies/jwt.js`), so every live member
 * session is invalidated IMMEDIATELY and the member cannot authenticate on the
 * next request — closing the stateless-token window where a banned/suspended
 * member kept a working session (and could download) until natural expiry.
 *
 * Only fires on a genuine transition (`nextStatus !== previousStatus`) and never
 * on a re-activation (`active` sessions are cleared by the member's own logout,
 * not by this hook). A no-op on create and on any non-status update.
 */
export const revokeMemberSessionsOnStatusChange: CollectionBeforeChangeHook = ({
  data,
  operation,
  originalDoc,
}) => {
  if (!data || operation !== 'update') {
    return data
  }
  const previousStatus = (originalDoc as { status?: string } | undefined)?.status
  const nextStatus = typeof data.status === 'string' ? data.status : previousStatus
  if (nextStatus !== 'active' && nextStatus !== previousStatus) {
    data.sessions = []
  }
  return data
}
