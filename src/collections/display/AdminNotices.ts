import { extname } from 'path'
import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync } from '../../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { toRelationId } from '../utils'

/** Permanent menu-grant key gating this collection (see AdminMenus.ts). */
export const ADMIN_NOTICES_MENU_KEY = 'content.adminNotices'

/** Max attachments per notice (ref 1-50: 첨부파일 최대 5개까지). */
export const ADMIN_NOTICE_MAX_ATTACHMENTS = 5

/** Allowed attachment extensions (ref 1-50: png,gif,jpg — jpeg accepted as a jpg alias). */
const ALLOWED_ATTACHMENT_EXTENSIONS = ['png', 'gif', 'jpg', 'jpeg']

const adminNoticesAudit = auditCollection(ADMIN_NOTICES_MENU_KEY)

/**
 * Enforces the "pin period only when pinned" rule server-side (LOW-1), not just
 * via `admin.condition` (which is a UI concern a crafted API write bypasses).
 * When the effective `noticeType` is not `pinned`, both pin dates are cleared —
 * so a general notice can never carry a stale/injected pin window. The
 * effective type is read from `data`, falling back to `originalDoc` on a
 * partial update.
 */
const clearPinPeriodWhenNotPinned: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data) {
    return data
  }
  const noticeType = 'noticeType' in data ? data.noticeType : originalDoc?.noticeType
  if (noticeType !== 'pinned') {
    data.pinFrom = null
    data.pinTo = null
  }
  return data
}

/**
 * Validates each attachment's media extension against the legacy png/gif/jpg
 * allow-list (ref 1-50). Loads the referenced media doc (like `posts`) rather
 * than trusting client input. `maxRows: 5` on the field already caps the count;
 * this guards the file type.
 */
const validateNoticeAttachments: CollectionBeforeValidateHook = async ({ data, req }) => {
  if (!data || !Array.isArray(data.attachments)) {
    return data
  }
  for (const att of data.attachments) {
    const mediaId = toRelationId((att as { media?: unknown })?.media)
    if (mediaId === undefined) {
      continue
    }
    const media = await req.payload.findByID({
      collection: 'media',
      id: mediaId,
      depth: 0,
      overrideAccess: true,
      req,
      disableErrors: true,
    })
    if (media && typeof media.filename === 'string') {
      const ext = extname(media.filename).toLowerCase().replace(/^\./, '')
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
        throw new APIError(`Attachment type ".${ext}" is not allowed; use png, gif, or jpg.`, 400)
      }
    }
  }
  return data
}

/**
 * Legacy 관리자 공지사항 (Administrator Notices — refs 1-49/1-50). A dedicated
 * notice manager (NOT a board): pinned (공지) notices sort above general ones
 * (see `compareAdminNotices` in content/display.ts), a pin period applies only
 * when pinned, and each notice carries a rich body + up to 5 image attachments
 * (png/gif/jpg) with optional per-file descriptions.
 *
 * TENANT-SCOPED (admin site) exactly like the other Task 3C collections —
 * `tenantScopedMenuAccess` + the create-time `tenantMembershipGuard`.
 *
 * The list's date-range + keyword search is default admin-UI behavior; the
 * Editor/HTML/TEXT body input modes collapse onto Lexical (the HTML/TEXT mode
 * selection + sanitize-on-render is the same Phase-4 concern as `posts`).
 */
export const AdminNotices: CollectionConfig = {
  slug: 'adminNotices',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'noticeType', 'department', 'author', 'createdAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, ADMIN_NOTICES_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(ADMIN_NOTICES_MENU_KEY),
    read: tenantScopedMenuAccess(ADMIN_NOTICES_MENU_KEY),
    update: tenantScopedMenuAccess(ADMIN_NOTICES_MENU_KEY),
    delete: tenantScopedMenuAccess(ADMIN_NOTICES_MENU_KEY),
  },
  fields: [
    {
      name: 'noticeType',
      type: 'select',
      required: true,
      defaultValue: 'general',
      options: [
        { label: 'Pinned notice (공지)', value: 'pinned' },
        { label: 'General (일반)', value: 'general' },
      ],
      admin: { description: 'Pinned notices sort above general ones (ref 1-49).' },
    },
    {
      name: 'pinFrom',
      type: 'date',
      admin: {
        condition: (_data, sibling) => sibling?.noticeType === 'pinned',
        date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' },
        description: 'Pin-period start — applies only to pinned notices (ref 1-50 callout 1).',
      },
    },
    {
      name: 'pinTo',
      type: 'date',
      admin: {
        condition: (_data, sibling) => sibling?.noticeType === 'pinned',
        date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' },
        description: 'Pin-period end — applies only to pinned notices.',
      },
    },
    { name: 'title', type: 'text', required: true },
    { name: 'department', type: 'relationship', relationTo: 'departments' },
    { name: 'team', type: 'text', admin: { description: 'Team name (팀명).' } },
    { name: 'author', type: 'text', admin: { description: 'Author display name (작성자).' } },
    {
      name: 'content',
      type: 'richText',
      admin: {
        description:
          'Notice body (Editor mode). HTML/TEXT input modes + sanitize-on-render are a Phase-4 concern (as with posts).',
      },
    },
    {
      name: 'attachments',
      type: 'array',
      maxRows: ADMIN_NOTICE_MAX_ATTACHMENTS,
      labels: { singular: 'Attachment', plural: 'Attachments' },
      admin: {
        description: `Up to ${ADMIN_NOTICE_MAX_ATTACHMENTS} image files (png/gif/jpg), each with an optional description (ref 1-50).`,
      },
      fields: [
        { name: 'media', type: 'upload', relationTo: 'media', required: true },
        {
          name: 'description',
          type: 'text',
          admin: { description: 'Attachment description (첨부파일 설명).' },
        },
      ],
    },
  ],
  hooks: {
    beforeValidate: [
      tenantMembershipGuard(),
      clearPinPeriodWhenNotPinned,
      validateNoticeAttachments,
    ],
    afterChange: [adminNoticesAudit.afterChange],
    afterDelete: [adminNoticesAudit.afterDelete],
  },
}
