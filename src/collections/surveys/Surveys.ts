import type { CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { surveyStatus } from '../../content/survey'
import { surveyExportEndpoints } from '../../endpoints/surveyExport'
import { SURVEYS_MENU_KEY } from './defaults'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const surveysAudit = auditCollection(SURVEYS_MENU_KEY)

/**
 * Legacy 설문조사 관리 (Survey Management — refs 2-9..2-12). TENANT-SCOPED
 * (per-site) exactly like `boards`/`posts`: opted into the multi-tenant plugin
 * (adds a required `tenant` → sites), gated on `content.surveys` via
 * `tenantScopedMenuAccess`, with the reusable create-time membership guard.
 *
 * A survey's questions (`surveyQuestions`) and responses (`surveyResponses`) are
 * SEPARATE collections — see `defaults.ts` for the decision. `status`
 * (scheduled|open|closed) is DERIVED from the window + `isActive` and never
 * stored (a stored status goes stale); `hasResponses`/`startedAt` are
 * server-managed and freeze the survey's questions once the survey starts
 * (ref 2-12, enforced in SurveyQuestions.ts).
 */
export const Surveys: CollectionConfig = {
  slug: 'surveys',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'audience', 'openFrom', 'openTo', 'isActive'],
    hidden: ({ user }) => !hasMenuAccessSync(user, SURVEYS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    read: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    update: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    delete: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'description',
      type: 'richText',
      admin: {
        description: 'Intro/description shown above the survey (rendered via the safe serializer).',
      },
    },
    {
      name: 'department',
      type: 'relationship',
      relationTo: 'departments',
      admin: { description: 'Owning department (person-in-charge context, ref 2-9).' },
    },
    {
      name: 'contactPhone',
      type: 'text',
      admin: { description: 'Contact phone for enquiries (ref 2-9).' },
    },
    { name: 'topic', type: 'text', admin: { description: 'Survey topic/category (ref 2-9).' } },
    // ── Open window (MINUTE precision — legacy uses a minute-precision window) ─
    {
      name: 'openFrom',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' },
        description:
          'Survey opens at this time. Leave empty for a draft (questions stay editable).',
      },
    },
    {
      name: 'openTo',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime', timeFormat: 'HH:mm' },
        description: 'Survey closes at this time. Empty means no upper bound.',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Master on/off toggle. An inactive survey is always Closed.' },
    },
    {
      name: 'status',
      type: 'text',
      virtual: true,
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          'Derived lifecycle: scheduled | open | closed (from the window + Active toggle).',
      },
      hooks: {
        // Virtual, read-only convenience for the admin list — the source of truth
        // is always the pure `surveyStatus` helper (used everywhere else).
        afterRead: [({ data }) => (data ? surveyStatus(data) : 'closed')],
      },
    },
    {
      name: 'audience',
      type: 'select',
      required: true,
      defaultValue: 'anyone',
      options: [
        { label: 'Anyone (public)', value: 'anyone' },
        { label: 'Members only (login required)', value: 'members' },
      ],
      admin: { description: 'Who may respond. Members-only surveys require a public-site login.' },
    },
    {
      name: 'resultVisibility',
      type: 'select',
      required: true,
      defaultValue: 'afterClose',
      options: [
        { label: 'After close only', value: 'afterClose' },
        { label: 'During and after (in-progress results)', value: 'duringAndAfter' },
        { label: 'Admins only', value: 'adminsOnly' },
      ],
      admin: { description: 'When aggregate results are viewable on the public site (ref 2-12).' },
    },
    {
      name: 'anonymous',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Responses are not tied to a member identity (respondent stored as null). One-response is still deduped by a hashed key.',
      },
    },
    // ── Server-managed start tracking (freezes questions — ref 2-12) ─────────
    {
      name: 'hasResponses',
      type: 'checkbox',
      defaultValue: false,
      // Machine-managed: set true when the first response arrives (surveyResponses
      // afterChange, via overrideAccess). Locked so a client can't forge it.
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, description: 'True once the first response has been recorded.' },
    },
    {
      name: 'startedAt',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description: 'When the first response arrived. Once started, questions are immutable.',
      },
    },
  ],
  // Access-gated, tenant-scoped CSV exports (ref 2-12): summary aggregate +
  // raw per-respondent. GET /api/surveys/:id/export/summary|responses.
  endpoints: surveyExportEndpoints,
  hooks: {
    beforeValidate: [tenantMembershipGuard('tenant')],
    afterChange: [surveysAudit.afterChange],
    afterDelete: [surveysAudit.afterDelete],
  },
}
