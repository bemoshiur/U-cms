import type { Access } from 'payload'

import { tenantScopedMenuAccess } from './tenantAccess'

/**
 * Access for the `members` collection (Task 4B). Two audiences read/write it:
 *
 *  - MEMBERS (the public-site identity, `collection: 'members'`) — a logged-in
 *    member may read/update ONLY their own record (self-service profile). They
 *    can never create or delete members, and never see another member.
 *  - ADMINS (`collection: 'users'`) — member management is gated on the
 *    `members.manage` menu grant AND tenant-scoped: an admin sees/edits only the
 *    members of the sites (tenants) they are assigned to. `isSuper` sees all.
 *    This is the same `tenantScopedMenuAccess` pattern every per-site collection
 *    uses; the `tenant` field here is a MANUAL relationship (members are not
 *    opted into the multi-tenant plugin — see Members.ts), scoped identically.
 *
 * Field-level access on the privilege-sensitive fields (`status`, `tenant`,
 * `loginId`, `termsConsents`) is what stops a self-editing member from
 * escalating (the Phase-1 users.roles/status class) — see Members.ts. This
 * function only decides whether the DOCUMENT may be touched at all.
 *
 * `MEMBERS_MENU_KEY` gates admin management (appended to the adminMenus seed).
 */
export const MEMBERS_MENU_KEY = 'members.manage'

/**
 * True when the acting principal is a public-site member (not an admin user).
 * Exported so ADMIN collections whose access returns truthy for any
 * authenticated `req.user` (`users`' self-access `Where`, `sites`' open read)
 * can explicitly EXCLUDE members — otherwise a member session, which shares the
 * `payload-token` cookie space, could read admin data (e.g. a `users` row via a
 * numeric-id collision, or the sites list). A member must have NIL admin access.
 */
export function isMemberPrincipal(user: unknown): boolean {
  return (
    typeof user === 'object' &&
    user !== null &&
    (user as { collection?: unknown }).collection === 'members'
  )
}

/**
 * `read`/`update` access: a member → constrained to their OWN doc (a `Where`
 * Payload evaluates against both list and by-id/update); an admin → the
 * tenant-scoped `members.manage` grant. No user → deny.
 */
export function memberSelfOrManageAccess(): Access {
  const manage = tenantScopedMenuAccess(MEMBERS_MENU_KEY, 'tenant')
  return async (args) => {
    const { req } = args
    if (!req.user) {
      return false
    }
    if (isMemberPrincipal(req.user)) {
      // A member may only ever act on their own record.
      return { id: { equals: req.user.id } }
    }
    return manage(args)
  }
}

/**
 * `create`/`delete` access: ADMINS only (tenant-scoped `members.manage`). Member
 * self-service sign-up creates records server-side with `overrideAccess: true`
 * (see `src/members/signup.ts`), which bypasses this; a member can never create
 * or delete a member through the access layer.
 */
export function memberManageAccess(): Access {
  const manage = tenantScopedMenuAccess(MEMBERS_MENU_KEY, 'tenant')
  return async (args) => {
    if (!args.req.user || isMemberPrincipal(args.req.user)) {
      return false
    }
    return manage(args)
  }
}
