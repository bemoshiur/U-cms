import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'

/**
 * A custom `validate` REPLACES Payload's default required-checking
 * validator entirely (see `validateSiteId` in src/collections/Sites.ts) —
 * `required` is threaded through `options.required` and enforced by hand
 * here.
 */
const validateRoleId: TextFieldSingleValidation = (value, { required }) => {
  if (required && (typeof value !== 'string' || value.length === 0)) {
    return 'Role ID is required.'
  }
  if (typeof value === 'string' && value.length > 0 && !/^ROLE_[A-Z0-9_]+$/.test(value)) {
    return 'Role ID must start with ROLE_, followed by uppercase letters, digits, and underscores only (e.g. "ROLE_ADMIN").'
  }
  return true
}

/**
 * Legacy 관리자 권한 관리 (Admin Role Management) — refs 1-10..1-13. A role
 * (`ROLE_*`) holds a set of admin-menu grants (`menuGrants`); an admin user
 * can hold several roles, and the union of every held role's grants (or an
 * unconditional bypass if any held role is `isSuper`) determines both admin
 * nav visibility and actual collection access — see
 * `src/access/hasMenuAccess.ts`. Global (not tenant-scoped) — roles are
 * shared across all sites, per docs/planning/development-plan.md §2.1.
 *
 * Note (accepted simplification, logged for a later UI pass): the legacy
 * checkbox-tree UI for setting `menuGrants` (ref 1-13 — open/close-all,
 * per-node checkboxes over the full menu hierarchy) is deferred to a later
 * custom-admin-component task; Phase 1 uses Payload's default multi-select
 * relationship widget. The `users` field below is a read-only `join` (ref
 * 1-12's "role users view") with no custom bulk-remove UI yet — that's the
 * same kind of deferred custom-component work.
 *
 * SECURITY NOTE: `system.roles` (this collection's own gate — see
 * `menuAccessConfig` below) is a near-super primitive by itself: anyone
 * holding it can mint a brand-new role with `isSuper: true`. It is
 * deliberately *not* enough to escalate on its own, though — a role only
 * takes effect once *assigned* to a user, and `users.roles` (see
 * `src/collections/Users.ts`) has its own field-level gate requiring
 * `system.admins`, independent of `system.roles`. Holding one without the
 * other lets you create a super role but not assign it to anyone
 * (including yourself).
 */
export const Roles: CollectionConfig = {
  slug: 'roles',
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['roleId', 'name', 'isSuper'],
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.roles'),
  },
  access: menuAccessConfig('system.roles'),
  fields: [
    {
      name: 'roleId',
      type: 'text',
      required: true,
      unique: true,
      validate: validateRoleId,
      admin: {
        description: 'e.g. "ROLE_ADMIN". Uppercase letters, digits, and underscores only.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
      required: true,
    },
    {
      name: 'isSuper',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Super roles bypass all menu permission checks.',
      },
    },
    {
      name: 'menuGrants',
      type: 'relationship',
      relationTo: 'adminMenus',
      hasMany: true,
      admin: {
        description:
          'Admin menus this role grants access to. Ignored for a role with isSuper checked (super roles bypass this entirely).',
      },
    },
    {
      name: 'users',
      type: 'join',
      collection: 'users',
      on: 'roles',
      admin: {
        description: 'Users holding this role (read-only — ref 1-12 "role users view").',
      },
    },
  ],
}
