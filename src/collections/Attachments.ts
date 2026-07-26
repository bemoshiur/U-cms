import type { CollectionConfig } from 'payload'

import { securityDocAttachmentRead } from '../access/securityDocs'
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
 * ## Visibility — MUST stay visible (do NOT set `admin.hidden: true`)
 *
 * The collection is a normal, browsable, tenant-gated collection (grouped under
 * "Content", like `boards`/`posts`). It deliberately does NOT set
 * `admin.hidden`: the richText `UploadFeature`'s `useEnabledRelationships` hook
 * (@payloadcms/richtext-lexical) filters candidate upload collections on
 * `visibleEntities` — i.e. `getVisibleEntities` / `admin.hidden` — BEFORE it
 * applies the `enabledCollections` allowlist. A hidden collection is invisible
 * to EVERY user (super included), so hiding this would make richText image
 * embedding resolve to zero collections and break silently across every
 * richText field. There is no "hidden from nav but usable in richText" option
 * in Payload 3.86 — the two share the `admin.hidden` gate.
 *
 * Visibility is NOT read access: `getVisibleEntities` never consults
 * `access.read`, so a Site-B admin sees the nav entry but `tenantMembershipAccess`
 * still filters the LIST/read to their own tenant (cross-tenant rows stay
 * denied). See `tests/int/attachmentAccess.int.spec.ts` (security) +
 * `tests/int/richTextUploadScope.int.spec.ts` (visibility + upload scoping).
 */
export const Attachments: CollectionConfig = {
  slug: 'attachments',
  admin: {
    group: 'Content',
    useAsTitle: 'filename',
  },
  // READ is §3-aware (Task 6D): a `securityDoc` attachment is readable ONLY by an
  // admin holding `privacy.securityDocs` (or super), within tenant — this closes
  // the raw `/api/attachments` + `/api/attachments/file/:filename` door for a
  // content-only admin. create/update/delete keep the plain tenant-membership
  // gate (the `securityDoc` flag is machine-set from the post, not client-set, so
  // there is no privilege to gate on write; the read gate is the confidentiality
  // boundary and backs the file route). See src/access/securityDocs.ts.
  access: {
    read: securityDocAttachmentRead(),
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
    // §3 security-document class, denormalized from the owning post (Task 6D).
    // Machine-managed: set true when this attachment is referenced by a
    // security-doc post (via the posts `syncAttachmentSecurityDoc` hook + the
    // board→posts flag-flip propagation). Write-locked (never client-set); the
    // hooks write it with `overrideAccess`. Drives `securityDocAttachmentRead`.
    {
      name: 'securityDoc',
      type: 'checkbox',
      defaultValue: false,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          "Denormalized security-document flag (auto-set from the referencing post's board).",
      },
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
