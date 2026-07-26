import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, isSuperUser } from '../access/hasMenuAccess'
import {
  getAssignedTenantIds,
  tenantMembershipGuard,
  tenantScopedMenuAccess,
} from '../access/tenantAccess'
import { auditCollection } from '../audit/auditCollection'
import { TERMS_CATEGORIES } from '../content/terms'
import { toRelationId } from './utils'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const TERMS_MENU_KEY = 'content.terms'

const termsAudit = auditCollection(TERMS_MENU_KEY)

/**
 * When a terms document is bound to a `menu` (optional — ref 2-15's
 * 내부링크선택), that menu MUST belong to the same site (tenant) as the document.
 * The document's own `tenant` is the source of truth (added by the multi-tenant
 * plugin + guarded on create by `tenantMembershipGuard`); this hook only rejects
 * a cross-site `menu` binding. Runs in `beforeValidate` so an invalid binding is
 * caught before the write. (Contrast `WebContents`, where `menu` is REQUIRED and
 * DERIVES the tenant — here `menu` is optional and merely a display-routing link.)
 */
const enforceMenuSameTenant: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) {
    return data
  }
  const menuId = toRelationId('menu' in data ? data.menu : originalDoc?.menu)
  if (menuId === undefined) {
    return data // unbound — nothing to check
  }
  const tenantId = toRelationId('tenant' in data ? data.tenant : originalDoc?.tenant)
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
  if (
    tenantId !== undefined &&
    menuTenantId !== undefined &&
    String(menuTenantId) !== String(tenantId)
  ) {
    throw new APIError('A terms document and its bound menu must belong to the same site.', 400)
  }
  // Belt: a non-super writer must be assigned to the menu's site too.
  if (menuTenantId !== undefined && req.user && !isSuperUser(req.user)) {
    const assigned = getAssignedTenantIds(req.user)
    if (!assigned.some((id) => String(id) === String(menuTenantId))) {
      throw new APIError("You are not assigned to this menu's site (tenant).", 403)
    }
  }
  return data
}

/**
 * Legacy 개인정보처리방침 약관관리 (Privacy Policy Terms Management — refs 2-14,
 * 2-15, 2-16). TENANT-SCOPED (per-site) and VERSIONED, mirroring `WebContents`
 * (T3D) EXACTLY, including the B1 lesson (readVersions scoped on `version.tenant`).
 *
 * ## The five fixed categories (ref 2-14)
 *
 * Each site keeps one terms document per fixed `category` (see
 * `src/content/terms.ts` for the confirmed five). The `(tenant, category)`
 * UNIQUE index enforces "exactly one document per category per site", so the
 * "exactly one ACTIVE version" maps cleanly onto that one document's PUBLISHED
 * version (below). An optional `menu` binds the document to a site menu purely
 * for display routing (ref 2-15) — it is not the tenant source and not unique.
 *
 * ## Versioning — Payload built-in versions + drafts (identical to WebContents)
 *
 * `versions: { drafts: true, maxPerDoc: 0 }`: every save writes a new version
 * row and the full history is retained. The legacy "exactly one 사용(in-use)
 * version" maps to the PUBLISHED document (`_status='published'`, what
 * `payload.find` returns) — the single ACTIVE version rendered publicly; drafts
 * (`_status='draft'`) and superseded published versions live in the history
 * (`payload.findVersions`). "Re-activate a prior version" (ref 2-16's 사용여부
 * 변경) is `payload.restoreVersion`, which republishes a prior version's data.
 * History is retained for consent evidencing — a member's `termsConsents`
 * snapshots the ACTIVE version id at sign-up (see `src/members/terms.ts`), and
 * that snapshot is immutable even as new versions are published.
 */
export const TermsDocuments: CollectionConfig = {
  slug: 'termsDocuments',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'menu', 'effectiveDate', 'updatedAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, TERMS_MENU_KEY),
  },
  versions: {
    drafts: true,
    // 0 = keep every version (full history), so any prior version is restorable
    // and the public change-log can list them (ref 2-16).
    maxPerDoc: 0,
  },
  access: {
    create: tenantScopedMenuAccess(TERMS_MENU_KEY),
    read: tenantScopedMenuAccess(TERMS_MENU_KEY),
    update: tenantScopedMenuAccess(TERMS_MENU_KEY),
    delete: tenantScopedMenuAccess(TERMS_MENU_KEY),
    // VERSION READS — MUST be scoped on the VERSION field path (B1, phase-3
    // review §2): a top-level `tenant` key does not exist on a version row.
    // Without this, the multi-tenant wrapper degrades to `Boolean(req.user)` and
    // every admin reads every tenant's draft + historical terms snapshots.
    readVersions: tenantScopedMenuAccess(TERMS_MENU_KEY, 'version.tenant'),
  },
  // One terms document per category per site (drives "one active version").
  // `tenant` is added by the multi-tenant plugin before schema build, so the
  // compound index resolves it (mirrors Menus' `[tenant, menuNumber]`).
  indexes: [{ fields: ['tenant', 'category'], unique: true }],
  fields: [
    {
      name: 'category',
      type: 'select',
      required: true,
      options: TERMS_CATEGORIES.map((c) => ({ label: `${c.label} (${c.korean})`, value: c.value })),
      admin: {
        description: 'One of the five fixed legacy terms categories (ref 2-14). Unique per site.',
      },
    },
    {
      name: 'menu',
      type: 'relationship',
      relationTo: 'menus',
      admin: {
        description:
          'Optional site menu this terms document is surfaced under (ref 2-15). Must belong to the same site.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: { description: 'Display title of the terms document.' },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      admin: {
        description:
          'The terms body. Versioned — every save creates a new version; the published version is the active one shown publicly.',
      },
    },
    {
      name: 'effectiveDate',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayOnly' },
        description:
          'The date this version takes effect (shown in the public change history, ref 2-16).',
      },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard('tenant'), enforceMenuSameTenant],
    afterChange: [termsAudit.afterChange],
    afterDelete: [termsAudit.afterDelete],
  },
}
