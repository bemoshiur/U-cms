import type { CollectionConfig, TextFieldSingleValidation } from 'payload'

import { hasMenuAccessSync, menuAccessConfig } from '../access/hasMenuAccess'
import { auditCollection } from '../audit/auditCollection'
import { preventSelfReferentialCycle } from './utils'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const adminMenusAudit = auditCollection('system.menus')

/**
 * A custom `validate` REPLACES Payload's default required-checking
 * validator entirely (see `validateSiteId` in src/collections/Sites.ts) —
 * `required` is threaded through `options.required` and enforced by hand
 * here.
 */
const validateMenuKey: TextFieldSingleValidation = (value, { required }) => {
  if (required && (typeof value !== 'string' || value.length === 0)) {
    return 'Menu key is required.'
  }
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    !/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/.test(value)
  ) {
    return 'Menu key must be a dot-separated path of segments, each starting with a lowercase letter (letters/digits only), e.g. "system.sites" or "system.codes.detail".'
  }
  return true
}

/**
 * Legacy 관리자 권한 관리(메뉴 권한 설정) — ref 1-13 — the admin menu tree that
 * `roles.menuGrants` checkboxes against. Global (not tenant-scoped) — the
 * admin menu structure is shared across all sites, per
 * docs/planning/development-plan.md §2.1.
 *
 * **`menuKey` is a PERMANENT identifier** — it is the actual permission key
 * every gated collection's `access`/`admin.hidden` checks against (see
 * `src/access/hasMenuAccess.ts`), not just a display convenience. Renaming
 * a `menuKey` after it has been granted to any role silently revokes that
 * grant (the old key no longer resolves to anything) and orphans the
 * `menuKeyToAdminMenuId` cache entry for the old key until server restart.
 * Treat `menuKey` values as append-only/immutable in practice; add new
 * nodes rather than renaming existing ones.
 *
 * Note (accepted simplification, logged for a later UI pass): the legacy
 * checkbox-tree UI for `roles.menuGrants` (ref 1-13 — open-all/close-all,
 * per-node checkboxes) is deferred to a later custom-admin-component task.
 * Phase 1 uses Payload's default list view + a plain `relationship` field
 * for `parent` and a default multi-select for `roles.menuGrants`.
 */
export const AdminMenus: CollectionConfig = {
  slug: 'adminMenus',
  admin: {
    group: 'System',
    useAsTitle: 'name',
    defaultColumns: ['menuKey', 'name', 'parent', 'order', 'collectionSlug'],
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'system.menus'),
  },
  access: menuAccessConfig('system.menus'),
  fields: [
    {
      name: 'menuKey',
      type: 'text',
      required: true,
      unique: true,
      validate: validateMenuKey,
      admin: {
        description:
          'PERMANENT permission key, dot-path convention (e.g. "system.sites"). Every gated collection checks against this exact string — do not rename after roles have been granted this menu.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'adminMenus',
      admin: {
        description: 'Parent menu node. Leave empty for a top-level (1-depth) menu.',
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Sibling display order (lower first).',
      },
    },
    {
      name: 'collectionSlug',
      type: 'text',
      admin: {
        description:
          'The Payload collection slug this menu node gates, if any (e.g. "sites"). Leave empty for a pure grouping/parent node with no directly bound collection.',
      },
    },
  ],
  hooks: {
    beforeChange: [preventSelfReferentialCycle('adminMenus')],
    afterChange: [adminMenusAudit.afterChange],
    afterDelete: [adminMenusAudit.afterDelete],
  },
}
