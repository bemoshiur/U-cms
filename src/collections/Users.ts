import type { Access, CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccess } from '../access/hasMenuAccess'

/**
 * `read`/`update` access for `users`: any authenticated user may always
 * read+update THEIR OWN doc (self-access override, per the Task 1C brief),
 * regardless of role grants; anyone holding `system.admins` may read/update
 * everyone. No user → false.
 *
 * For a `findByID`-style check (`id` provided): an exact self-match returns
 * `true` immediately; otherwise falls through to the menu grant.
 * For a list-style check (`id` undefined, e.g. the admin list view): a full
 * grant returns `true` (see everyone); otherwise returns a `Where` that
 * restricts the list to the caller's own doc — Payload supports `Access`
 * returning either a `boolean` or a `Where` (see `AccessResult` in
 * `node_modules/payload/dist/config/types.d.ts`), and evaluates a returned
 * `Where` against a specific doc too, so this same branch also correctly
 * denies a non-self, non-granted `findByID` on someone else's doc.
 */
function selfOrMenuAccess(menuKey: string): Access {
  const menuGate = menuAccess(menuKey)
  return async (args) => {
    const { id, req } = args
    if (!req.user) {
      return false
    }
    if (id !== undefined && id === req.user.id) {
      return true
    }
    if (await menuGate(args)) {
      return true
    }
    return { id: { equals: req.user.id } }
  }
}

/**
 * Legacy 관리자 계정 관리 (Admin Account Management) — refs 1-15/1-16. Full
 * admin-account fields (status workflow, 2FA reset, profile photo, etc.)
 * land in Task 1D; this task adds only what the permission backbone needs:
 * `roles` (which roles this admin holds) and a placeholder `name`.
 *
 * `auth.depth: 1` is load-bearing, not cosmetic — see the design-decision
 * comment at the top of `src/access/hasMenuAccess.ts` for why the
 * synchronous `admin.hidden` nav-visibility check depends on `req.user.roles`
 * always arriving as populated `Role` docs on real HTTP admin requests.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    // Deliberately does NOT special-case self here: hiding the collection
    // from the nav for a roleless self-service user is a presentational
    // gap only (they can still self-read/update via direct API/URL per the
    // access config below) — a dedicated "my profile" surface for such
    // users is Task 1D scope.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.admins'),
  },
  access: {
    create: menuAccess('system.admins'),
    read: selfOrMenuAccess('system.admins'),
    update: selfOrMenuAccess('system.admins'),
    delete: menuAccess('system.admins'),
  },
  auth: {
    depth: 1,
  },
  fields: [
    // Email added by default
    {
      name: 'name',
      type: 'text',
      admin: {
        description:
          'Display name (legacy 관리자 이름). Full admin-account fields land in Task 1D.',
      },
    },
    {
      name: 'roles',
      type: 'relationship',
      relationTo: 'roles',
      hasMany: true,
      saveToJWT: true,
      admin: {
        description:
          "Roles held by this admin. Effective menu access is the union of every held role's grants, or unconditional if any held role has isSuper checked.",
      },
    },
  ],
}
