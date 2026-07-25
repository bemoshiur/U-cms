import type { CollectionBeforeValidateHook, CollectionConfig, Where } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync } from '../../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { toRelationId } from '../utils'
import { activeField, displayOrderField, linkFields } from './shared'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const GUIDE_MENUS_MENU_KEY = 'content.guideMenus'

/** Legacy rule (ref 1-53): at most 5 TOP guide menus per site. */
export const MAX_TOP_GUIDE_MENUS = 5

const guideMenusAudit = auditCollection(GUIDE_MENUS_MENU_KEY)

/**
 * Enforces the legacy max-5-top rule (ref 1-53: 상단 메뉴는 5개까지 설정가능) PER
 * SITE. Counts the site's OTHER top guide menus (excluding the row being
 * saved); a create/update that would make a 6th top menu on that tenant is
 * rejected. Bottom menus are unbounded. The effective position/tenant are read
 * from `data` first, falling back to `originalDoc` for partial updates.
 */
const enforceMaxTopGuideMenus: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data
  }
  const position = 'position' in data ? data.position : originalDoc?.position
  if (position !== 'top') {
    return data
  }
  const tenantId = toRelationId('tenant' in data ? data.tenant : originalDoc?.tenant)
  if (tenantId === undefined) {
    return data
  }
  const conditions: Where[] = [{ tenant: { equals: tenantId } }, { position: { equals: 'top' } }]
  if (originalDoc?.id !== undefined) {
    conditions.push({ id: { not_equals: originalDoc.id } })
  }
  const existing = await req.payload.find({
    collection: 'guideMenus',
    where: { and: conditions },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  if (existing.docs.length >= MAX_TOP_GUIDE_MENUS) {
    throw new APIError(
      `A site may have at most ${MAX_TOP_GUIDE_MENUS} top guide menus (상단 메뉴는 ${MAX_TOP_GUIDE_MENUS}개까지 설정가능).`,
      400,
    )
  }
  return data
}

/**
 * Legacy 상단/하단 가이드메뉴관리 (Top/Bottom Guide Menu Management — ref 1-53).
 * The EXTRA, configurable guide-menu links shown in a site's top/bottom
 * utility bars. Each row is one link; `position` (top|bottom) selects the bar.
 * TENANT-SCOPED (per-site) like the other Task 3C collections.
 *
 * ## Fixed defaults are NOT stored here
 *
 * The built-in top defaults — 로그인 (Login), 회원가입 (Sign-up), 사이트맵 (Sitemap) —
 * are frontend-rendered constants (ref 1-53: added menus are placed AFTER those
 * defaults). These rows are only the extra configurable ones, and (ref 1-53)
 * at most 5 TOP menus per site (`enforceMaxTopGuideMenus`).
 *
 * ## Deferred UI
 *
 * The legacy screen is a batch inline editor (nothing persists until Save) with
 * a 4-way order control and an internal-link picker popup — all Phase-4 UI. The
 * collection stores the rows; `displayOrder` + `reorder` (content/display.ts)
 * back the ordering.
 */
export const GuideMenus: CollectionConfig = {
  slug: 'guideMenus',
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'position', 'displayOrder', 'active'],
    hidden: ({ user }) => !hasMenuAccessSync(user, GUIDE_MENUS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(GUIDE_MENUS_MENU_KEY),
    read: tenantScopedMenuAccess(GUIDE_MENUS_MENU_KEY),
    update: tenantScopedMenuAccess(GUIDE_MENUS_MENU_KEY),
    delete: tenantScopedMenuAccess(GUIDE_MENUS_MENU_KEY),
  },
  fields: [
    {
      name: 'position',
      type: 'select',
      required: true,
      defaultValue: 'top',
      options: [
        { label: 'Top guide bar (상단)', value: 'top' },
        { label: 'Bottom guide bar (하단)', value: 'bottom' },
      ],
      admin: { description: 'Which utility bar this menu appears in (max 5 for top, ref 1-53).' },
    },
    { name: 'name', type: 'text', required: true, admin: { description: 'Menu name (메뉴명).' } },
    ...linkFields({ includeNewWindow: true }),
    displayOrderField(),
    activeField(),
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard(), enforceMaxTopGuideMenus],
    afterChange: [guideMenusAudit.afterChange],
    afterDelete: [guideMenusAudit.afterDelete],
  },
}
