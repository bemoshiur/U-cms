import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccess } from '../access/hasMenuAccess'

/**
 * `media` → `content.media` per the Task 1C wiring table.
 *
 * ## `read` — INTERIM authenticated-only gate (B2, phase-3-final-review §2)
 *
 * `read` was `() => true` (fully public, no auth, no tenant) on the rationale
 * that `sites.logo` uploads through `media` and must render on the public
 * homepage. That rationale is Phase-4-only: Phase 3 is the first phase to route
 * ACCESS-CONTROLLED content through `media` (`Posts.attachments[].media`, and
 * posts carry `isSecret`), so secret + cross-tenant board attachments now live
 * in the same pool that previously held only public logos. With a public `read`
 * AND `/api/media/file` exempt from the admin IP guard, those attachments were
 * fetchable with NO auth via a guessable filename, and any authenticated admin
 * could list every tenant's files via `/api/media`.
 *
 * INTERIM FIX (closes the UNAUTHENTICATED vector now): require an authenticated
 * user for any `media` read — `/api/media` (list) and `/api/media/file/*` (the
 * upload file route, which runs Payload's `read` access) both deny anonymous
 * callers. This is deliberately broad (any admin, no tenant/secret filter) — it
 * is NOT the full fix.
 *
 * PHASE 4 T-ZERO (mandatory, before ANY public read ships): a tenant/secret-
 * aware `read` distinguishing public logos from board attachments (or a
 * separate tenant-scoped attachment collection / signed URLs), routing all
 * attachment fetches through `/api/files/download`, and re-opening a deliberate
 * public logo path. The cross-tenant-among-authenticated-admins vector is only
 * fully closed by that work — this interim gate does NOT resolve it.
 *
 * No current app surface depends on unauthenticated media reads: the frontend
 * scaffold renders no `media` upload, and `next.config.ts`'s
 * `localPatterns: /api/media/file/**` is only a Next/Image allowlist, not an
 * active public fetch.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'content.media'),
  },
  access: {
    // INTERIM (B2): authenticated-only. Denies anonymous /api/media and
    // /api/media/file. Phase 4 replaces this with a tenant/secret-aware fn.
    read: ({ req }) => Boolean(req.user),
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
