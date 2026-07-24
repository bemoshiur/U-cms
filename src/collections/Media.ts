import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccess } from '../access/hasMenuAccess'

/**
 * `media` → `content.media` per the Task 1C wiring table, with one
 * deliberate deviation from gating every op uniformly: `read` stays public
 * (`() => true`), unlike every other gated collection. `media` isn't only
 * an admin-managed asset library — `sites.logo` (src/collections/Sites.ts)
 * uploads through it and that logo is meant to render on the *public*
 * homepage. Gating `read` behind an authenticated admin's menu grant would
 * 403 anonymous visitors fetching a site's own logo (and, later, any other
 * publicly-rendered upload — board images, etc., per
 * docs/planning/development-plan.md §2.3). Only the admin-management
 * operations (create/update/delete) and the nav-visibility check are
 * gated; anonymous file reads are unaffected.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'content.media'),
  },
  access: {
    read: () => true,
    create: menuAccess('content.media'),
    update: menuAccess('content.media'),
    delete: menuAccess('content.media'),
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: true,
}
