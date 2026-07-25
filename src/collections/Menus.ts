import type {
  CollectionBeforeValidateHook,
  CollectionConfig,
  TextFieldSingleValidation,
} from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../access/tenantAccess'
import { auditCollection } from '../audit/auditCollection'
import { isHttpUrl, isSafeInternalLink } from '../content/display'
import { preventSelfReferentialCycle, toRelationId } from './utils'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const MENUS_MENU_KEY = 'content.menus'

const menusAudit = auditCollection(MENUS_MENU_KEY)

/** The five menu content types (legacy CONTENT_TYPE): placeholder/program/board/content/link. */
export const MENU_CONTENT_TYPES = ['placeholder', 'program', 'board', 'content', 'link'] as const

/** Menu visibility by session state (ref 2-13 노출조건). */
export const MENU_EXPOSURE_CONDITIONS = ['always', 'loggedInOnly', 'loggedOutOnly'] as const

/**
 * `linkUrl` validator (ref 1-44/2-13): required and valid ONLY when the menu's
 * `contentType` is `link`. A valid value is EITHER a genuine site-relative
 * internal link (`/path` or `?menuSn=…` — see `isSafeInternalLink`, which
 * mirrors `safeRedirect`) OR an absolute http(s) URL (`isHttpUrl`). This is the
 * T3C linkInternal/linkExternal split collapsed onto the one legacy `linkUrl`
 * field; the same stored-XSS / open-redirect hardening applies because Phase 4
 * renders this as a clickable `href`. A custom `validate` REPLACES Payload's
 * default, so the non-link cases are handled explicitly (pass-through).
 */
const validateMenuLink: TextFieldSingleValidation = (value, options) => {
  const contentType = (options?.siblingData as { contentType?: unknown } | undefined)?.contentType
  if (contentType !== 'link') {
    return true
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return 'A link URL is required when the content type is Link.'
  }
  if (!isSafeInternalLink(value) && !isHttpUrl(value)) {
    return 'Link must be a site-relative path (e.g. /bos/home or ?menuSn=…) or an absolute http(s) URL — no other schemes or protocol-relative values.'
  }
  return true
}

/**
 * Assigns the per-site `menuNumber` on create and enforces that a `parent`
 * menu belongs to the SAME site (tenant). Runs in `beforeValidate`
 * (collection) — after `tenantMembershipGuard` (which validates the writer is
 * assigned to the effective tenant) and before the field-level `unique`
 * validation on the generated `menuNumber` fires (mirrors `Boards.assignBbsId`
 * / `Codes.validateAndComputeDepth`).
 *
 * `menuNumber` is a per-SITE sequence (legacy `menuSn`, used in public URLs):
 * the value is `max(menuNumber for this tenant) + 1`. RACE-SAFETY (documented,
 * deliberate — same posture as `generateNextSequentialId`): this
 * find-max-then-increment is a TOCTOU, made safe by the compound
 * `(tenant, menuNumber)` UNIQUE index (see `indexes` below). Two concurrent
 * creates on the same site that compute the same number trip the constraint;
 * Payload's Postgres adapter converts the `23505` into a clean 400
 * `ValidationError`, and the admin retries. Uniqueness is per-site (not global),
 * so different sites reuse the same low numbers — exactly the legacy model.
 */
const assignMenuNumberAndValidateParent: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data
  }

  const tenantId = toRelationId('tenant' in data ? data.tenant : originalDoc?.tenant)

  // Parent must be in the same site (tenant) — a menu tree never crosses sites.
  const parentId = toRelationId('parent' in data ? data.parent : originalDoc?.parent)
  if (parentId !== undefined) {
    const parent = await req.payload.findByID({
      collection: 'menus',
      id: parentId,
      depth: 0,
      overrideAccess: true,
      req,
      disableErrors: true,
    })
    if (!parent) {
      throw new APIError('The referenced parent menu does not exist.', 400)
    }
    if (
      tenantId !== undefined &&
      toRelationId(parent.tenant) !== undefined &&
      String(toRelationId(parent.tenant)) !== String(tenantId)
    ) {
      throw new APIError('A menu and its parent must belong to the same site (tenant).', 400)
    }
  }

  // Generate the per-site menuNumber on create (immutable thereafter — the
  // field's write access denies client sets, so seeds/hooks own it).
  if (
    operation === 'create' &&
    (data.menuNumber === undefined || data.menuNumber === null) &&
    tenantId !== undefined
  ) {
    const existing = await req.payload.find({
      collection: 'menus',
      where: { tenant: { equals: tenantId } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    let max = 0
    for (const doc of existing.docs) {
      const n = (doc as { menuNumber?: unknown }).menuNumber
      if (typeof n === 'number' && Number.isFinite(n) && n > max) {
        max = n
      }
    }
    data.menuNumber = max + 1
  }

  return data
}

/**
 * Legacy 관리자 메뉴 관리 (admin-site, ref 1-44) + 사용자 메뉴 관리 (user-site,
 * ref 2-13) — ONE collection serving both menu trees, distinguished by the
 * menu's site (tenant). TENANT-SCOPED (per-site) like boards: the multi-tenant
 * plugin adds a required `tenant` → `sites`, gated on `content.menus` via
 * `tenantScopedMenuAccess`, with the create-time membership guard.
 *
 * ── menu → web content (1:1) ──────────────────────────────────────────────
 * A menu with `contentType = content` binds exactly one versioned `webContents`
 * document. The binding lives on `webContents.menu` (a `unique` relationship —
 * one web content per menu), NOT here, so there is a single source of truth and
 * no two-way relationship to keep in sync. See `WebContents.ts`.
 *
 * ── active / inactive ─────────────────────────────────────────────────────
 * `active` (default true) — an inactive menu is hidden from the public nav and
 * shown in red in the admin tree (legacy). The red-in-tree styling is a Phase-4
 * admin-UI concern; the field is the data behind it.
 */
export const Menus: CollectionConfig = {
  slug: 'menus',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'menuNumber', 'contentType', 'parent', 'active'],
    hidden: ({ user }) => !hasMenuAccessSync(user, MENUS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(MENUS_MENU_KEY),
    read: tenantScopedMenuAccess(MENUS_MENU_KEY),
    update: tenantScopedMenuAccess(MENUS_MENU_KEY),
    delete: tenantScopedMenuAccess(MENUS_MENU_KEY),
  },
  // Per-site uniqueness of the URL-facing menuNumber (see the generator above
  // for the friendly-error layer). `tenant` is added by the multi-tenant
  // plugin before schema build, so the compound index resolves it.
  indexes: [{ fields: ['tenant', 'menuNumber'], unique: true }],
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'menuNumber',
      type: 'number',
      // System-assigned per-site sequence, never client-set (mirrors
      // boards.bbsId): field-level write access denies every create/update so a
      // crafted API call can't supply or mutate it. The beforeValidate hook
      // sets it via the normal (non-override) data path; seeds pass it through
      // with overrideAccess (which bypasses field access).
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          'System-assigned per-site menu number (legacy menuSn), used in public URLs. Unique within a site.',
      },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'menus',
      admin: { description: 'Parent menu (same site). Leave empty for a top-level menu.' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: { description: 'Sibling display order (lower first).' },
    },
    {
      name: 'contentType',
      type: 'select',
      defaultValue: 'placeholder',
      options: [
        { label: 'Placeholder (no link)', value: 'placeholder' },
        { label: 'Program', value: 'program' },
        { label: 'Board', value: 'board' },
        { label: 'Web content', value: 'content' },
        { label: 'Link', value: 'link' },
      ],
      admin: {
        description: 'What this menu points at (ref 1-44). Drives which fields below apply.',
      },
    },
    {
      name: 'board',
      type: 'relationship',
      relationTo: 'boards',
      admin: {
        condition: (_data, sibling) => sibling?.contentType === 'board',
        description: 'The board this menu opens (when content type is Board).',
      },
    },
    {
      name: 'linkUrl',
      type: 'text',
      validate: validateMenuLink,
      admin: {
        condition: (_data, sibling) => sibling?.contentType === 'link',
        description:
          'Site-relative path (/bos/… or ?menuSn=…) or an absolute http(s) URL (when content type is Link).',
      },
    },
    {
      name: 'newWindow',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Open the target in a new window (링크 방식: 새창).' },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Active (사용). Inactive menus are hidden from the public nav (shown red in the admin tree — Phase-4 UI).',
      },
    },
    // ── USER-site menu extras (ref 2-13) — stored always; meaning gated by site ─
    {
      name: 'personInCharge',
      type: 'relationship',
      relationTo: ['users', 'departments'],
      admin: {
        description:
          'Data manager (담당자) — a user or department. Surfaces on the PUBLIC site only when the site’s dataManagerEnabled toggle is on (Phase 1 sites).',
      },
    },
    {
      name: 'exposureCondition',
      type: 'select',
      defaultValue: 'always',
      options: [
        { label: 'Always', value: 'always' },
        { label: 'Logged-in users only', value: 'loggedInOnly' },
        { label: 'Logged-out users only', value: 'loggedOutOnly' },
      ],
      admin: { description: 'Menu visibility by session state (ref 2-13 노출조건).' },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard(), assignMenuNumberAndValidateParent],
    beforeChange: [preventSelfReferentialCycle('menus')],
    afterChange: [menusAudit.afterChange],
    afterDelete: [menusAudit.afterDelete],
  },
}
