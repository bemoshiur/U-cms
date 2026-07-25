import type { CollectionConfig } from 'payload'

import { tenantMembershipAccess, tenantMembershipGuard } from '../access/tenantAccess'

/**
 * `attachments` — the tenant-scoped, access-controlled upload pool for board /
 * post files and admin-notice attachments (Task 4-zero; closes phase-3-final-
 * review §2-B2 fully).
 *
 * ## Why a separate collection from `media`
 *
 * Phase 3 routed ACCESS-CONTROLLED content (`posts.attachments[].media`,
 * `adminNotices.attachments[].media`) through the single global `media` pool,
 * which also held genuinely-public assets (site logos, banner/popup images).
 * With `media.read` public (needed so the public site can render a logo), a
 * board attachment — including a SECRET post's file, and files of OTHER tenants
 * — was fetchable by any authenticated admin via `/api/media` +
 * `/api/media/file/<name>`, wholly bypassing the `canDownloadPost` gate on
 * `/api/files/download`.
 *
 * This collection isolates those files:
 *  - It is opted into the multi-tenant plugin (`payload.config.ts`), so every
 *    attachment carries a `tenant` → `sites`.
 *  - `read` is tenant-membership-scoped (`tenantMembershipAccess`): an admin
 *    sees only their assigned sites' attachments; `isSuper` all; anonymous
 *    denied. So a Site-B admin cannot list or fetch a Site-A attachment (secret
 *    or not) by id, filename, or any REST/file route, and nothing is reachable
 *    unauthenticated.
 *  - The raw file route `/api/attachments/file/*` is NOT IP-exempt (see
 *    `EXEMPT_API_PREFIXES`) and runs this `read`, so it is doubly gated.
 *
 * With attachments moved here, `media` holds ONLY public display assets and its
 * `read` is public again (the deliberate public logo path — see Media.ts).
 *
 * ## The ONE sanctioned download path
 *
 * Actual downloads still go through `/api/files/download` (`fileDownload.ts`),
 * which reads the attachment with `overrideAccess:true` and applies the full
 * `canDownloadPost` visibility gate (super / author / same-tenant posts-admin,
 * secret-aware) plus the download counter. The collection `read` above is the
 * belt-and-suspenders raw-route gate; the two never diverge into a public hole
 * again because neither is blanket-public.
 *
 * ## `admin.hidden`
 *
 * Hidden from the nav — it is a backing store managed through the post /
 * admin-notice editors' upload fields, not browsed directly. Hiding a
 * collection does not affect the upload-field drawer or its own access control.
 */
export const Attachments: CollectionConfig = {
  slug: 'attachments',
  admin: {
    group: 'Content',
    hidden: true,
    useAsTitle: 'filename',
  },
  access: {
    read: tenantMembershipAccess(),
    create: tenantMembershipAccess(),
    update: tenantMembershipAccess(),
    delete: tenantMembershipAccess(),
  },
  fields: [
    {
      // Optional human label (accessibility text for image attachments; a
      // caption for files). NOT required — attachments are arbitrary files
      // (pdf/hwp/…), unlike `media` which requires `alt` for rendered images.
      name: 'alt',
      type: 'text',
    },
  ],
  hooks: {
    // Create-time tenant guard: an authenticated non-super uploader may only
    // create an attachment in a site (tenant) they are assigned to — Payload's
    // access `Where` covers read/update/delete but not create.
    beforeValidate: [tenantMembershipGuard()],
  },
  upload: true,
}
