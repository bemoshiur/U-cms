import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../access/hasMenuAccess'
import {
  PERSONAL_INFO_LOGS_MENU_KEY,
  personalInfoLogsEndpoints,
} from '../endpoints/personalInfoLogsExport'
import { auditLogAccess, readOnly, rejectLogUpdate } from './logCollection'

/** Permanent menu-grant key gating this collection + its CSV export. */
export { PERSONAL_INFO_LOGS_MENU_KEY }

/**
 * Personal-Information Access History (legacy 개인정보 열람 이력) —
 * feature-inventory refs 3-8 and 1-36. The CORE of the Privacy Protection
 * System: an APPEND-ONLY, IMMUTABLE audit row for EVERY touch of a member's
 * personal information in the back office — who (`viewerLabel`/`viewerId`)
 * accessed whose PII (`subjectLabel`/`subjectMemberId`, on which site
 * `subjectSiteId`), on which screen (`screen`) at which URL (`url`), what they
 * did (`action`: view/edit/export), for what documented purpose
 * (`purposeCategory` + free `purposeDetail`), from which IP (`ipAddress`) and
 * when (`occurredAt`).
 *
 * Written EXCLUSIVELY by `recordPersonalInfoAccess` (via `overrideAccess`),
 * driven by the non-bypassable members `afterRead`/`afterChange` capture hooks
 * (`src/members/personalInfoAudit.ts`) and the purpose-gated export endpoints —
 * so a raw REST read of a member (`GET /api/members/:id`) logs a `view` just
 * like the admin UI does. Never created by hand.
 *
 * ## GLOBAL (not tenant-scoped), but carries the subject's site
 *
 * Like `accessLogs`/`errorLogs`, this is a system-level PRIVACY-OFFICER store,
 * not a per-site one: the whole point is one authoritative, tamper-proof trail
 * the privacy officer (and auditors) reads. Members are tenant-scoped, so each
 * row DENORMALIZES the subject's site (`subjectSiteId`) for per-site
 * segmentation/filtering — but the collection itself is global and gated on the
 * single `privacy.personalInfoLogs` grant, so only the privacy officer reads it.
 * Members (a separate, lower-privilege AUDIENCE) have ZERO admin access, so
 * there is no cross-audience read; and because reads require the one global
 * grant, there is no cross-tenant leak of another site's log to a site admin.
 *
 * ## Immutability (mirrors the audit backbone)
 *
 * Reuses the shared `logCollection` primitives: `create` denies everyone (only
 * the system writer with `overrideAccess` writes), `update` is forbidden for
 * EVERYONE including super (both via `access.update: false` AND the
 * defense-in-depth `rejectLogUpdate` `beforeChange` guard — so the recorded
 * PURPOSE is immutable evidence), and `read`/`delete` are gated on
 * `privacy.personalInfoLogs` (delete = retention cleanup by the same grant).
 *
 * ## Identity is denormalized TEXT, never an FK (the deadlock lesson, T2A)
 *
 * `viewerId`/`subjectMemberId` are TEXT, never `relationship`. `recordPersonalInfoAccess`
 * writes in its OWN isolated transaction while the audited read/edit still holds
 * a row lock; a `users`/`members` FK would run a `FOR KEY SHARE` check on a
 * possibly-locked row — a cross-transaction deadlock Postgres cannot detect. A
 * text label also survives deletion of the user/member and needs no populate.
 * `viewerLabel`/`subjectLabel` are MASKED in the list view (display-only —
 * the real identity is stored for non-repudiation, per refs 3-8/1-36).
 */
export const PersonalInfoAccessLogs: CollectionConfig = {
  slug: 'personalInfoAccessLogs',
  admin: {
    group: 'Privacy Protection System',
    useAsTitle: 'subjectLabel',
    defaultColumns: [
      'occurredAt',
      'screen',
      'subjectLabel',
      'action',
      'purposeCategory',
      'viewerLabel',
    ],
    hidden: ({ user }) => !hasMenuAccessSync(user, PERSONAL_INFO_LOGS_MENU_KEY),
  },
  // Newest first (ref 3-8 list is most-recent-first).
  defaultSort: '-occurredAt',
  access: auditLogAccess(PERSONAL_INFO_LOGS_MENU_KEY),
  endpoints: personalInfoLogsEndpoints,
  hooks: {
    // Append-only: reject updates even under overrideAccess (defense in depth).
    beforeChange: [rejectLogUpdate],
  },
  fields: [
    readOnly({
      name: 'occurredAt',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
      admin: { description: 'When the personal-info access occurred (열람일시).' },
    }),
    readOnly({
      name: 'screen',
      type: 'text',
      admin: {
        description: 'Which admin screen produced the access (화면명, e.g. "member-detail").',
      },
    }),
    readOnly({
      name: 'subjectLabel',
      type: 'text',
      admin: {
        description:
          'Denormalized "name(loginId)" of the member whose PII was accessed. Masked in the list.',
        components: { Cell: '/components/audit/MaskedCell#MaskedCell' },
      },
    }),
    readOnly({
      name: 'subjectMemberId',
      type: 'text',
      index: true,
      admin: { description: 'The member id as TEXT (NOT an FK — see the deadlock note).' },
    }),
    readOnly({
      name: 'subjectSiteId',
      type: 'text',
      admin: { description: "The member's site (tenant) id as text — per-site segmentation." },
    }),
    readOnly({
      name: 'url',
      type: 'text',
      required: true,
      admin: { description: 'The full request URL/path (including the target member id).' },
    }),
    readOnly({
      name: 'action',
      type: 'select',
      required: true,
      index: true,
      options: [
        { label: 'View (열람)', value: 'view' },
        { label: 'Edit (수정)', value: 'edit' },
        { label: 'Export (다운로드)', value: 'export' },
      ],
    }),
    readOnly({
      name: 'purposeCategory',
      type: 'select',
      required: true,
      options: [
        { label: 'Personal info — inquiry (개인정보 조회)', value: 'view' },
        { label: 'Personal info — modification (개인정보 수정)', value: 'edit' },
        { label: 'Export / download', value: 'export' },
        { label: 'Inquiry response', value: 'inquiry_response' },
        { label: 'Complaint handling', value: 'complaint_handling' },
        { label: 'Other', value: 'other' },
      ],
      admin: { description: 'View-purpose category (열람목적구분).' },
    }),
    readOnly({
      name: 'purposeDetail',
      type: 'textarea',
      admin: {
        description:
          'Free-text reason (열람목적). REQUIRED for an export (the purpose modal) — the immutable evidence of why the PII was accessed.',
      },
    }),
    readOnly({
      name: 'viewerLabel',
      type: 'text',
      admin: {
        description:
          'Denormalized "name(loginId)" of the admin who accessed the PII. Masked in the list.',
        components: { Cell: '/components/audit/MaskedCell#MaskedCell' },
      },
    }),
    readOnly({
      name: 'viewerId',
      type: 'text',
      index: true,
      admin: { description: 'The acting admin id as TEXT (NOT an FK — see the deadlock note).' },
    }),
    readOnly({
      name: 'ipAddress',
      type: 'text',
      admin: {
        description:
          'Raw client IP (IPv4/IPv6), captured as-is from the request (열람IP). Masked in the list.',
        // Display-only IP masking in the list view (real value stored).
        components: { Cell: '/components/audit/MaskedCell#MaskedCell' },
      },
    }),
  ],
}
