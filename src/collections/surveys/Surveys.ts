import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { hasMenuAccessSync } from '../../access/hasMenuAccess'
import { tenantMembershipGuard, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { surveyStatus, windowHasOpened } from '../../content/survey'
import { surveyExportEndpoints } from '../../endpoints/surveyExport'
import { surveyResultsEndpoints } from '../../endpoints/surveyResults'
import { SURVEYS_MENU_KEY } from './defaults'

/** Access-history audit hooks (Task 2A) for this collection's mutations. */
const surveysAudit = auditCollection(SURVEYS_MENU_KEY)

/**
 * STICKY start latch (review C2). Stamps `startedAt` the first time a survey is
 * saved while its window has ALREADY opened, or once it has responses, and never
 * un-sets it. Crucially it reads the CURRENTLY-PERSISTED `openFrom`
 * (`originalDoc.openFrom`) on update, not the incoming value — so an admin who
 * PATCHes `openFrom` into the future to try to un-freeze the questions instead
 * TRIPS the latch on that very save (the pre-change window was open), and
 * `isSurveyStarted` (which reads this latch) stays true forever after. A genuine
 * draft/scheduled survey (window not yet open, no responses) is never latched,
 * so its questions remain editable. Runs in `beforeChange` (after field-access),
 * so the write-locked `startedAt` is set via the hook data path.
 */
const latchStartedAt: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (!data) {
    return data
  }
  // Once latched, keep it forever (never allow an un-set, even via overrideAccess).
  const existing = originalDoc?.startedAt
  if (existing) {
    data.startedAt = existing
    return data
  }
  // A caller may have explicitly stamped it (e.g. the responses hook) — respect it.
  if (data.startedAt) {
    return data
  }
  const now = new Date()
  // On create, check the incoming window; on update, the PRE-CHANGE window.
  const openFromForCheck = operation === 'create' ? data.openFrom : originalDoc?.openFrom
  const hasResponses = originalDoc?.hasResponses === true || data.hasResponses === true
  if (hasResponses || windowHasOpened(openFromForCheck, now)) {
    data.startedAt = now.toISOString()
  }
  return data
}

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
    components: {
      edit: {
        // Audit Fix 5 (ref 2-12): `resultsVisible(survey, 'admin')` is
        // unconditionally true, but until now nothing called it — there was no
        // admin UI for a survey's aggregate results at all (only the raw CSV
        // exports). This mounts a "View results" panel on the survey EDIT
        // screen, gated identically to those exports (GET
        // /api/surveys/:id/results, `src/endpoints/surveyResults.ts`) — see
        // `src/components/surveys/SurveyResultsPanel.tsx`.
        beforeDocumentControls: ['/components/surveys/SurveyResultsPanel#SurveyResultsPanel'],
      },
    },
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
      // STICKY LATCH (review C2): stamped by `latchStartedAt` the first time the
      // window opens OR a response arrives, and NEVER un-set. `isSurveyStarted`
      // reads it, so the question freeze cannot be reversed by editing openFrom.
      access: { create: () => false, update: () => false },
      admin: {
        readOnly: true,
        description:
          'Sticky start latch — set once the survey opens or gets its first response, never cleared. Freezes the questions.',
      },
    },
  ],
  // Access-gated, tenant-scoped CSV exports (ref 2-12): summary aggregate +
  // raw per-respondent. GET /api/surveys/:id/export/summary|responses. Plus
  // the JSON results endpoint (Audit Fix 5) the admin results panel fetches.
  endpoints: [...surveyExportEndpoints, ...surveyResultsEndpoints],
  hooks: {
    beforeValidate: [tenantMembershipGuard('tenant')],
    beforeChange: [latchStartedAt],
    afterChange: [surveysAudit.afterChange],
    afterDelete: [surveysAudit.afterDelete],
  },
}
