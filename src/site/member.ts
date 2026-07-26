/**
 * Public-site MEMBER session seam (Task 4A seam → WIRED in Task 4B).
 *
 * The public site distinguishes logged-in members from anonymous visitors —
 * menus carry an `exposureCondition` (always | loggedInOnly | loggedOutOnly),
 * and the top guide bar swaps Login/Sign-up for member links once a session
 * exists. Member auth is a SEPARATE identity from the admin `users` collection
 * (see `src/collections/Members.ts`); this is the single, documented place that
 * answers "who is the current visitor?".
 *
 * ## What T4B wired
 *
 * {@link getCurrentMember} now reads the real member session from the request
 * cookie via `payload.auth`, returning the member (or `null` when anonymous OR
 * when the session belongs to an ADMIN — an admin cookie must NEVER count as a
 * public-site member). The pure {@link readMemberFromHeaders} core is what the
 * integration tests drive with a real login token.
 *
 * The RSC layer (layout, home, sitemap, `/page`) already threads a
 * `CurrentMember` into `buildNav`, so wiring this one function lights up
 * `exposureCondition` visibility across the whole site.
 */

import type { Payload } from 'payload'

import { toRelationId } from '../collections/utils'

/**
 * The member identity the nav/header layer needs. Widened from the T4A stub
 * (`{ id } | null`) to carry the display name / login ID (header greeting +
 * member links) and the member's own tenant. `null` = anonymous.
 */
export type CurrentMember = {
  id: number | string
  name?: string | null
  loginId?: string | null
  tenant?: number | string | null
} | null

/**
 * Resolves the current member from request `headers`, or `null` when the
 * request carries no member session. Pure of Next.js — takes an explicit
 * `payload` + `headers` — so it is integration-testable with a real login token
 * (see `tests/int/members.int.spec.ts`) without a running Next server.
 *
 * SECURITY: returns `null` unless the resolved principal is BOTH of the
 * `members` collection AND `status: active`. An admin session (`collection:
 * 'users'`) resolves to `null` here, so a logged-in admin browsing the public
 * site is treated as an anonymous visitor — never a member.
 */
export async function readMemberFromHeaders(
  payload: Payload,
  headers: Headers,
): Promise<CurrentMember> {
  let user: unknown = null
  try {
    const result = await payload.auth({ headers })
    user = result.user
  } catch {
    return null
  }
  if (!user || typeof user !== 'object') {
    return null
  }
  const u = user as {
    collection?: unknown
    id?: number | string
    name?: unknown
    loginId?: unknown
    status?: unknown
    tenant?: unknown
  }
  if (u.collection !== 'members' || u.status !== 'active' || u.id === undefined) {
    return null
  }
  return {
    id: u.id,
    name: typeof u.name === 'string' ? u.name : null,
    loginId: typeof u.loginId === 'string' ? u.loginId : null,
    tenant: toRelationId(u.tenant) ?? null,
  }
}

/**
 * Resolves the current public-site member for the ACTIVE request, or `null` when
 * anonymous. Reads the request cookie via `payload.auth`. Next.js + Payload are
 * lazy-imported inside the body so importing this module (e.g. for the pure
 * {@link readMemberFromHeaders} in tests, or the `CurrentMember` type in the
 * unit-tested `nav.ts`) pulls no Next/`@payload-config` runtime.
 */
export async function getCurrentMember(): Promise<CurrentMember> {
  const [{ headers }, { getPayloadClient }] = await Promise.all([
    import('next/headers'),
    import('./rsc'),
  ])
  const payload = await getPayloadClient()
  const requestHeaders = await headers()
  return readMemberFromHeaders(payload, requestHeaders)
}
