import type { CollectionConfig, Field } from 'payload'

import { hasMenuAccessSync } from '../../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { activeField, exposureWindowFields, imageField, linkFields, titleField } from './shared'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const POPUPS_MENU_KEY = 'content.popups'

const popupsAudit = auditCollection(POPUPS_MENU_KEY)

/** One popup-window geometry dimension (px). */
function geometryField(name: string, label: string, defaultValue: number): Field {
  return {
    name,
    type: 'number',
    defaultValue,
    admin: { description: `${label} in px (popup window geometry, ref 1-48).` },
  }
}

/**
 * Legacy 관리자 팝업 관리 (Administrator Popup Management — refs 1-47/1-48; the
 * demo-site instance is ref 2-1). TENANT-SCOPED (per-site) exactly like
 * notification areas — see that collection's doc comment for the pattern.
 *
 * Reuses the shared image / title / link / active / exposure-window field-set
 * (no `newWindow`: a popup opens in its own geometry-controlled window, and no
 * `displayOrder`: the legacy popup list has no exposure-order column). Adds the
 * popup geometry (width/height/top/left px), a scrollbar toggle, and the
 * "close for a day" flag — the latter two are frontend rendering concerns, so
 * this collection only stores the flags (`isLive` still gates exposure).
 */
export const Popups: CollectionConfig = {
  slug: 'popups',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'active', 'exposeFrom', 'exposeTo'],
    hidden: ({ user }) => !hasMenuAccessSync(user, POPUPS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(POPUPS_MENU_KEY),
    read: tenantScopedMenuAccess(POPUPS_MENU_KEY),
    update: tenantScopedMenuAccess(POPUPS_MENU_KEY),
    delete: tenantScopedMenuAccess(POPUPS_MENU_KEY),
  },
  fields: [
    imageField('160 x 140'),
    titleField(),
    ...linkFields(),
    activeField(),
    ...exposureWindowFields(),
    geometryField('width', 'Width (넓이)', 400),
    geometryField('height', 'Height (높이)', 300),
    geometryField('top', 'Top position (팝업위치 TOP)', 100),
    geometryField('left', 'Left position (팝업위치 LEFT)', 100),
    {
      name: 'showScrollbar',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Scrollbar use (스크롤사용여부) — whether the popup window shows scrollbars.',
      },
    },
    {
      name: 'closeForDay',
      type: 'checkbox',
      defaultValue: true,
      admin: {
        description:
          'Close-for-a-day (하루닫기) — lets a viewer suppress the popup for one day (cookie behavior; frontend concern, the flag is stored here).',
      },
    },
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard()],
    afterChange: [popupsAudit.afterChange],
    afterDelete: [popupsAudit.afterDelete],
  },
}
