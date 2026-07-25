import type { Access, CollectionBeforeValidateHook } from 'payload'
import { APIError } from 'payload'

import { toRelationId } from '../collections/utils'
import { hasMenuAccess, isSuperUser } from './hasMenuAccess'

/**
 * Per-user tenant access for tenant-scoped collections (Task 3A; plan §2.1;
 * required by phase1-final-review.md item 2, "the first tenant-scoped
 * collection must land alongside a real per-user tenant-access function").
 *
 * ## Why this lives here and not on the plugin's `userHasAccessToAllTenants`
 *
 * `@payloadcms/plugin-multi-tenant`'s `userHasAccessToAllTenants(user)` is a
 * SINGLE global switch that governs tenant scoping on EVERY collection the
 * plugin touches at once — not just the opted-in content collections, but
 * also the `users` collection (it always wraps users' access) and the `sites`
 * tenants collection. Our architecture (plan §2.1) makes `users`, `roles`, and
 * `sites` GLOBAL, menu-based collections — only content (`boards`, and later
 * posts/menus/…) is tenant-scoped. Flipping that global flag to `isSuper`
 * would therefore:
 *   1. Tenant-scope the `users` collection — a non-super `system.admins`
 *      holder could then only manage users sharing their tenants, breaking the
 *      menu-based admin-manages-admin model (and the RBAC escalation tests).
 *   2. Tenant-scope the `sites` tenants-collection READ — re-triggering the
 *      exact admin-UI-500 lockout that `src/collections/Sites.ts`'s open-read
 *      decision fixed (the plugin's `TenantSelectionProvider` reads `sites`
 *      unconditionally on every `/admin` render for every user; denying that
 *      read 500s the whole panel). See phase1-final-review.md item 8.
 *
 * So the plugin flag stays `() => true` (it must not scope the global
 * collections), and the REAL per-user tenant enforcement is applied directly
 * on each tenant-scoped collection's `access` via this helper. With the flag
 * left permissive, the plugin's own `access` wrapper (`withTenantAccess`) is a
 * pass-through that returns this function's result unchanged.
 *
 * ## The rule
 *
 * - No user → deny.
 * - No `menuKey` grant (and not super) → deny.
 * - `isSuper` → full access (all tenants), mirroring the menu-grant bypass.
 * - Otherwise → constrain to the user's assigned tenants via a `Where` on the
 *   tenant field (`{ [tenantFieldName]: { in: assignedTenantIds } }`). Payload
 *   applies this as a filter on read/update/delete AND validates it on create
 *   (a create whose tenant isn't in the set is rejected).
 * - A non-super user with the grant but NO assigned tenants → deny (empty
 *   `in` would match nothing; deny explicitly rather than emit `{ in: [] }`).
 *
 * Reused by every future tenant-scoped collection (posts, menus, webContents,
 * banners, popups, surveys, terms, statistics, members — plan §2.1).
 */
export function tenantScopedMenuAccess(menuKey: string, tenantFieldName = 'tenant'): Access {
  return async ({ req }) => {
    if (!req.user) {
      return false
    }
    // Menu gate first — also returns true for isSuper (grant bypass).
    if (!(await hasMenuAccess(req, menuKey))) {
      return false
    }
    // Super-admins access every tenant, exactly as they bypass menu grants.
    if (isSuperUser(req.user)) {
      return true
    }
    const tenantIds = getAssignedTenantIds(req.user)
    if (tenantIds.length === 0) {
      return false
    }
    return { [tenantFieldName]: { in: tenantIds } }
  }
}

/**
 * Tenant-membership read/write scope WITHOUT a menu-grant gate (Task 4-zero).
 *
 * A leaner sibling of `tenantScopedMenuAccess` for the shared `attachments`
 * upload pool (`src/collections/Attachments.ts`), which backs BOTH `posts` and
 * `adminNotices` — two collections gated on DIFFERENT menuKeys (`content.posts`
 * vs `content.adminNotices`). No single menuKey fits, so the collection-level
 * gate is pure tenant isolation: an authenticated user sees only attachments of
 * the sites (tenants) they are assigned to; `isSuper` sees all; anonymous is
 * denied. The finer per-post author/secret/grant nuance is NOT expressed here —
 * it lives in `canDownloadPost` on the ONE sanctioned fetch path
 * (`/api/files/download`, `overrideAccess:true`). This raw-route gate only has
 * to guarantee the confidentiality invariants: no cross-tenant read, no
 * anonymous read (so a secret post's file is unreachable to any outsider), which
 * tenant scoping delivers. Same permissive-plugin-flag reasoning as
 * `tenantScopedMenuAccess` applies (the plugin wrapper is a pass-through).
 */
export function tenantMembershipAccess(tenantFieldName = 'tenant'): Access {
  return ({ req }) => {
    if (!req.user) {
      return false
    }
    if (isSuperUser(req.user)) {
      return true
    }
    const tenantIds = getAssignedTenantIds(req.user)
    if (tenantIds.length === 0) {
      return false
    }
    return { [tenantFieldName]: { in: tenantIds } }
  }
}

/**
 * The reusable create-time tenant-membership guard (Task 3A pattern, extracted
 * in Task 3C so every per-site collection wires the identical rule rather than
 * re-inlining it — `boards`/`posts` predate this and keep their inline copies).
 *
 * Payload applies the per-user tenant `Where` from `tenantScopedMenuAccess` to
 * read/update/delete, but NOT to create (a `Where` cannot constrain a
 * not-yet-existing row), so a crafted create carrying another site's tenant
 * would otherwise slip past. This `beforeValidate` hook closes that gap: for an
 * authenticated NON-super writer, the effective tenant (from `data`, falling
 * back to `originalDoc` on partial updates) must be one they are assigned to.
 * System/seed writes (no `req.user`) and super-admins are exempt.
 */
export function tenantMembershipGuard(tenantFieldName = 'tenant'): CollectionBeforeValidateHook {
  return ({ data, originalDoc, req }) => {
    if (!data) {
      return data
    }
    // Skip PUBLIC-SITE MEMBERS (Task 4B): this guard reads the ADMIN `users.
    // tenants` array (`getAssignedTenantIds`), which members don't have. A member
    // editing their own record can't change `tenant` anyway (it's field-access-
    // locked to `members.manage`), so there is nothing to guard here. Inlined
    // (not `isMemberPrincipal`) to avoid a tenantAccess↔memberAccess import cycle.
    const isMember = (req.user as { collection?: unknown } | undefined)?.collection === 'members'
    if (req.user && !isSuperUser(req.user) && !isMember) {
      const effectiveTenant = toRelationId(
        tenantFieldName in data ? data[tenantFieldName] : originalDoc?.[tenantFieldName],
      )
      if (effectiveTenant !== undefined) {
        const assigned = getAssignedTenantIds(req.user)
        if (!assigned.some((id) => String(id) === String(effectiveTenant))) {
          throw new APIError("You are not assigned to this record's site (tenant).", 403)
        }
      }
    }
    return data
  }
}

/**
 * Extracts the tenant IDs a user is assigned to, from the multi-tenant
 * plugin's `users.tenants` array (each row is `{ tenant: <site> }`). Handles
 * both populated (`{ tenant: { id } }`) and unpopulated (`{ tenant: id }`)
 * shapes via `toRelationId`. Kept as a tiny local reader rather than importing
 * the plugin's internal `getUserTenantIDs` to avoid depending on a deep path,
 * and so the exact field/shape assumption is documented in-repo.
 */
export function getAssignedTenantIds(user: unknown): (string | number)[] {
  if (!user || typeof user !== 'object') {
    return []
  }
  const tenants = (user as { tenants?: unknown }).tenants
  if (!Array.isArray(tenants)) {
    return []
  }
  const ids: (string | number)[] = []
  for (const row of tenants) {
    const id = toRelationId((row as { tenant?: unknown })?.tenant)
    if (id !== undefined) {
      ids.push(id)
    }
  }
  return ids
}
