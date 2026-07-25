import type { CollectionAfterErrorHook, CollectionAfterLogoutHook, PayloadRequest } from 'payload'

import { extractLoginIdentifier } from './helpers'
import { recordLoginHistory } from './loginHistory'
import { recordAccess } from './recordAccess'

/**
 * Auth-lifecycle audit writers (Task 2A Part 2/3). All three are wired onto
 * the `users` collection (see `src/collections/Users.ts`) and, like every
 * audit writer, never throw into the auth flow.
 */

/**
 * Records a successful login (refs 1-55 로그인, 3-7): one `accessLogs` row
 * (`action: 'login'`) plus one success `loginHistory` row. Called from the
 * `afterLogin` hook (`recordLastLogin`) after `lastLoginAt` is stamped, so the
 * passed `sessionLoginAt` is this session's start.
 *
 * `afterLogin` fires for BOTH the HTTP login and the Local-API
 * `payload.login()`, so success capture is exercised directly by the
 * integration tests.
 */
export async function recordLoginSuccessAudit(
  req: PayloadRequest,
  user: Record<string, unknown>,
  sessionLoginAt: string,
): Promise<void> {
  await recordAccess(req.payload, {
    req,
    action: 'login',
    actor: user,
    // See `linkActor` in recordAccess: the login transaction holds a FOR UPDATE
    // lock on THIS user's row (session handling), so setting the `actor` FK
    // here would deadlock the isolated audit write. Identity is preserved via
    // `actorLabel`.
    linkActor: false,
    menuLabel: 'Login',
    url: req?.pathname ?? '/api/users/login',
    sessionLoginAt,
  })

  const loginId =
    (typeof user.loginId === 'string' && user.loginId ? user.loginId : undefined) ??
    (typeof user.email === 'string' ? user.email : undefined)

  await recordLoginHistory(req.payload, {
    req,
    success: true,
    userLabel: typeof user.name === 'string' && user.name ? user.name : undefined,
    loginId,
  })
}

/** True when this request is a login attempt (`.../users/login`). */
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
 * Records a FAILED login (ref 3-6 로그인 실패 이력) as a `loginHistory` row with
 * `success: false`.
 *
 * ## Why `afterError`, and its limitation
 *
 * Payload 3.86 has no dedicated login-failure hook — a bad password throws
 * `AuthenticationError` inside the login operation *before* any `afterLogin`
 * hook runs (verified in `node_modules/payload/dist/auth/operations/login.js`).
 * The one seam that fires on that throw is the collection `afterError` hook,
 * invoked by `routeError` on the REST/GraphQL path with the same `req` (so
 * `req.data.email` — the attempted identifier — is still present). This hook
 * therefore captures every real (HTTP) failed login.
 *
 * `afterError` fires for ANY error on `users`, so it is filtered down to
 * genuine login attempts (`.../users/login`). It does NOT fire for the
 * Local-API `payload.login()` (which bypasses `routeError` entirely) — a
 * documented, acceptable gap, since programmatic logins are not the
 * security-relevant failed-attempt surface (see task-2A-report.md). Returns
 * nothing so the original error response is left untouched.
 */
export const recordLoginFailure: CollectionAfterErrorHook = async ({ collection, error, req }) => {
  try {
    if (collection?.slug !== 'users' || !isLoginRequest(req)) {
      return
    }
    // Task 2B: the 2FA gate throws once, mid-login, when the password is correct
    // but the OTP has not been entered yet (step-1 → step-2 handoff). That is a
    // benign intermediate, not a failed login — `require2FA` flags it here so we
    // don't pollute login history with a "failure" on every 2FA sign-in. A
    // *wrong* OTP is NOT flagged, so it still records as a real failure.
    if (req?.context?.skipTwoFactorFailureLog) {
      return
    }
    await recordLoginHistory(req.payload, {
      req,
      success: false,
      loginId: extractLoginIdentifier(req),
      failReason: error instanceof Error ? error.message : undefined,
    })
  } catch (err) {
    req?.payload?.logger?.error?.(
      { err },
      '[audit] recordLoginFailure failed — swallowed to preserve the error response',
    )
  }
  return undefined
}

/**
 * Records a logout (ref 1-55) as an `accessLogs` row (`action: 'logout'`).
 * `req.user` is still populated when `afterLogout` runs (verified in
 * `node_modules/payload/dist/auth/operations/logout.js`), so the actor is
 * resolvable. Fires on the HTTP logout; the Local API has no logout operation.
 */
export const recordLogout: CollectionAfterLogoutHook = async ({ req }) => {
  await recordAccess(req.payload, {
    req,
    action: 'logout',
    actor: req.user,
    // Same reason as login: the logout transaction locks this user's row.
    linkActor: false,
    menuLabel: 'Logout',
    url: req?.pathname ?? '/api/users/logout',
  })
}
