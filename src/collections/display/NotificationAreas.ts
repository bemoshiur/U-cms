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
export const NOTIFICATION_AREAS_MENU_KEY = 'content.notificationAreas'

const notificationAreasAudit = auditCollection(NOTIFICATION_AREAS_MENU_KEY)

/**
 * Legacy 관리자 알림 영역 (Administrator Notification Area — refs 1-45/1-46; the
 * demo-site instance is ref 2-1). The image-banner notification slots shown on
 * a site's main screen. TENANT-SCOPED (per-site): the multi-tenant plugin adds
 * a required `tenant` → `sites`, and enforcement is the T3A pattern —
 * `tenantScopedMenuAccess` on `access` + the create-time `tenantMembershipGuard`
 * (Payload's access `Where` covers read/update/delete but not create).
 *
 * Shares the exposure-window / active / display-order / link field-set with
 * popups + banners (see `./shared`); an item is "live" only inside its window
 * AND active (`isLive`, content/display.ts). The 4-way order drag UI and the
 * internal-link picker popup are Phase-4 concerns.
 */
export const NotificationAreas: CollectionConfig = {
  slug: 'notificationAreas',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'active', 'displayOrder', 'exposeFrom', 'exposeTo'],
    hidden: ({ user }) => !hasMenuAccessSync(user, NOTIFICATION_AREAS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(NOTIFICATION_AREAS_MENU_KEY),
    read: tenantScopedMenuAccess(NOTIFICATION_AREAS_MENU_KEY),
    update: tenantScopedMenuAccess(NOTIFICATION_AREAS_MENU_KEY),
    delete: tenantScopedMenuAccess(NOTIFICATION_AREAS_MENU_KEY),
  },
  fields: [
    imageField('490 x 245'),
    titleField(),
    ...linkFields({ includeNewWindow: true }),
    activeField(),
    ...exposureWindowFields(),
    displayOrderField(),
  ],
  hooks: {
    beforeValidate: [tenantMembershipGuard()],
    afterChange: [notificationAreasAudit.afterChange],
    afterDelete: [notificationAreasAudit.afterDelete],
  },
}
