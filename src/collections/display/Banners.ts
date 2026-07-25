import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import {
  activeField,
  displayOrderField,
  exposureWindowFields,
  imageField,
  linkFields,
  titleField,
} from './shared'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const BANNERS_MENU_KEY = 'content.banners'

const bannersAudit = auditCollection(BANNERS_MENU_KEY)

/**
 * Legacy 관리자 배너관리 (Administrator Banner Management — refs 1-51/1-52; the
 * demo-site instance is ref 2-1). TENANT-SCOPED (per-site) exactly like
 * notification areas — see that collection's doc comment for the pattern.
 *
 * Reuses the shared image / title / link / active / exposure-window /
 * display-order field-set, plus the legacy "representative banner file"
 * (대표 배너파일) flag. `newWindow` is the 링크 방식 (new window vs current page)
 * toggle. `isLive` (content/display.ts) gates exposure; the 4-way order UI is
 * a Phase-4 concern.
 */
export const Banners: CollectionConfig = {
  slug: 'banners',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'isRepresentative', 'active', 'displayOrder', 'exposeFrom'],
    hidden: ({ user }) => !hasMenuAccessSync(user, BANNERS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(BANNERS_MENU_KEY),
    read: tenantScopedMenuAccess(BANNERS_MENU_KEY),
    update: tenantScopedMenuAccess(BANNERS_MENU_KEY),
    delete: tenantScopedMenuAccess(BANNERS_MENU_KEY),
  },
  fields: [
    imageField('196 x 70'),
    {
      name: 'isRepresentative',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Representative banner file (대표 배너파일) — the primary banner for the site.',
      },
    },
    titleField(),
    ...linkFields({ includeNewWindow: true }),
    activeField(),
    ...exposureWindowFields(),
    displayOrderField(),
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard()],
    afterChange: [bannersAudit.afterChange],
    afterDelete: [bannersAudit.afterDelete],
  },
}
