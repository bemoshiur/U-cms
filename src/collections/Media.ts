import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync, menuAccess } from '../access/hasMenuAccess'

/**
 * `media` → `content.media` per the Task 1C wiring table.
 *
 * ## `read` — PUBLIC display-asset pool (Task 4-zero; deliberate public path)
 *
 * `media` is the pool for genuinely-PUBLIC display assets: site logos
 * (`sites.logo`), banner / popup / notification-area images
 * (`src/collections/display/shared.ts`), user profile photos, and Phase-4
 * public content images. All of these are meant to be RENDERED on a page (the
 * public homepage renders the logo; Phase 4 T4A depends on an unauthenticated
 * logo read), so `read` is public and `/api/media/file/*` is re-exempted from
 * the admin IP guard (see src/security/adminIpEnforcement.ts).
 *
 * ## Why public read is safe again (the B2 fix)
 *
 * In Phase 3 this pool ALSO held access-controlled files —
 * `posts.attachments[].media` (incl. SECRET posts and cross-tenant board files)
 * and `adminNotices.attachments[].media`. A public `media.read` + an IP-exempt
 * file route made those fetchable with no auth / across tenants, bypassing the
 * `canDownloadPost` gate (phase-3-final-review §2-B2). Task 4-zero moved EVERY
 * access-controlled attachment OUT of `media` into the tenant-scoped
 * `attachments` collection (`src/collections/Attachments.ts`). `media` now holds
 * ONLY public assets, so restoring public read cannot leak a private file — the
 * `/api/media/file` route can only ever serve a public logo/image.
 *
 * ## INVARIANT — nothing access-controlled may relate to `media` (ENFORCED)
 *
 * Everything that relates to `media` is public-by-design and rendered on a page:
 * `sites.logo`, the display images (`display/shared.ts` — banners/popups/
 * notification areas), `users.profilePhoto`, and future public content images.
 * Every access-controlled/tenant-scoped/downloadable upload MUST instead relate
 * to `attachments` (fetched via `/api/files/download`). This is ENFORCED on both
 * upload surfaces:
 *   - explicit `relationTo: 'attachments'` upload relations (posts/adminNotices), and
 *   - the shared richText editor's `UploadFeature`, restricted to `attachments`
 *     via `enabledCollections` (`src/richTextEditor.ts`) — so an image embedded
 *     in ANY richText field (incl. a secret post / tenant-scoped draft) also
 *     lands in the gated pool, never here.
 * Adding a private upload relation to `media`, or widening the richText upload
 * allowlist to include `media`, would re-open B2.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    // Menu-based access control (Task 1C) — see src/access/hasMenuAccess.ts.
    hidden: ({ user }) => !hasMenuAccessSync(user, 'content.media'),
  },
  access: {
    // PUBLIC read (Task 4-zero): `media` is the public display-asset pool
    // (logos, banner/popup images, profile photos). Access-controlled files
    // live in `attachments`, NOT here — see the docblock above and Attachments.ts.
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
