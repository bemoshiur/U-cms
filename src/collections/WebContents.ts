import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, isSuperUser } from '../access/hasMenuAccess'
import { getAssignedTenantIds, tenantScopedMenuAccess } from '../access/tenantAccess'
import { auditCollection } from '../audit/auditCollection'
import { webContentDiffEndpoint } from '../endpoints/webContentDiff'
import { toRelationId } from './utils'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const WEB_CONTENTS_MENU_KEY = 'content.webContents'

const webContentsAudit = auditCollection(WEB_CONTENTS_MENU_KEY)

/**
 * Derives `tenant` from the bound `menu` (a web content ALWAYS inherits its
 * menu's site) and enforces tenant membership on create — the reusable T3A/T3B
 * pattern (see `Posts.validatePostAgainstBoard`): Payload's access `Where`
 * covers read/update/delete but NOT create, so a crafted create carrying
 * another site's menu is rejected here. Runs in `beforeValidate` so the derived
 * `tenant` is present before the plugin's required-tenant validation.
 */
const deriveTenantFromMenu: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) {
    return data
  }

  const menuId = toRelationId('menu' in data ? data.menu : originalDoc?.menu)
  if (menuId === undefined) {
    // `menu` is required — let the field's own required validation reject it.
    return data
  }

  const menu = await req.payload.findByID({
    collection: 'menus',
    id: menuId,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })
  if (!menu) {
    throw new APIError('The referenced menu does not exist.', 400)
  }

  const menuTenantId = toRelationId(menu.tenant)
  if (menuTenantId !== undefined) {
    data.tenant = menuTenantId
    if (req.user && !isSuperUser(req.user)) {
      const assigned = getAssignedTenantIds(req.user)
      if (!assigned.some((id) => String(id) === String(menuTenantId))) {
        throw new APIError("You are not assigned to this content's site (tenant).", 403)
      }
    }
  }

  return data
}

/**
 * Legacy 웹 컨텐츠 관리 + 버전 관리 (Web Content Management + Version Control —
 * refs 2-2, 2-3, 2-4; plan §2.4). TENANT-SCOPED (per-site) like boards; a web
 * content's `tenant` is DERIVED from (and always equals) its bound menu's site.
 *
 * ## Versioning — Payload built-in versions + drafts (the legacy mapping)
 *
 * `versions: { drafts: true, maxPerDoc: 0 }` uses Payload's native version
 * store: EVERY save writes a new version row, and `maxPerDoc: 0` keeps the full
 * history (plan §2.4 "every save = a new version"). The legacy "exactly one
 * ACTIVE version" maps to the PUBLISHED document: `_status = 'published'` is the
 * single active version rendered to the site; drafts (`_status = 'draft'`) and
 * every superseded published version live in the history. "Re-activate a prior
 * version" is Payload's built-in `payload.restoreVersion({ collection, id })`,
 * which republishes that version's data as the current document (writing a new
 * version in the process) — so the active version is always exactly one, and
 * any prior one can be restored. The legacy hash-compare-against-an-external-JSP
 * is DROPPED (plan §2.4 — content now lives in the DB only, versioned here).
 *
 * ## menu ↔ content (1:1)
 *
 * `menu` is a REQUIRED, `unique` relationship — content exists only for a
 * created menu (ref 2-2), and at most one web content binds a given menu.
 *
 * ## DIFF (ref 2-4)
 *
 * `GET /api/webContents/:id/diff?from=&to=` (the collection endpoint below)
 * returns the structured field/line diff between two versions, access-gated on
 * `content.webContents` + tenant. The pure diff lives in
 * `src/content/webContentDiff.ts`; the split/unified RENDER UI is Phase 4.
 */
export const WebContents: CollectionConfig = {
  slug: 'webContents',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'menu', 'name', 'updatedAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, WEB_CONTENTS_MENU_KEY),
  },
  versions: {
    drafts: true,
    // 0 = keep every version (full history), so any prior version is restorable.
    maxPerDoc: 0,
  },
  access: {
    create: tenantScopedMenuAccess(WEB_CONTENTS_MENU_KEY),
    read: tenantScopedMenuAccess(WEB_CONTENTS_MENU_KEY),
    update: tenantScopedMenuAccess(WEB_CONTENTS_MENU_KEY),
    delete: tenantScopedMenuAccess(WEB_CONTENTS_MENU_KEY),
  },
  endpoints: [webContentDiffEndpoint],
  fields: [
    {
      name: 'menu',
      type: 'relationship',
      relationTo: 'menus',
      required: true,
      unique: true,
      admin: {
        description:
          'The menu this content is bound to (1:1). Content exists only for a created menu (ref 2-2).',
      },
    },
    { name: 'name', type: 'text', admin: { description: 'Internal name (legacy 컨텐츠명).' } },
    { name: 'title', type: 'text', admin: { description: 'Display title of the page.' } },
    {
      name: 'content',
      type: 'richText',
      admin: {
        description:
          'The page body. Versioned — every save creates a new version; the published version is the active one.',
      },
    },
    {
      name: 'responsibleDept',
      type: 'relationship',
      relationTo: 'departments',
      admin: { description: 'Responsible department (담당부서, optional — ref 2-2).' },
    },
    {
      name: 'responsiblePerson',
      type: 'text',
      admin: { description: 'Responsible person (담당자, optional — ref 2-2).' },
    },
    {
      name: 'contentUrl',
      type: 'text',
      admin: {
        readOnly: true,
        description:
          'Informational only — legacy served content via a controller URL; the rebuild renders in Phase 4.',
      },
    },
  ],
  hooks: {
    beforeValidate: [deriveTenantFromMenu],
    afterChange: [webContentsAudit.afterChange],
    afterDelete: [webContentsAudit.afterDelete],
  },
}
