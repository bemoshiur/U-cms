import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'

import { hasMenuAccessSync } from '../../access/hasMenuAccess'
import { tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { toRelationId } from '../utils'
import { SURVEYS_MENU_KEY } from './defaults'

const responsesAudit = auditCollection(SURVEYS_MENU_KEY)

/** Field-access lock: server-forced fields a client/admin-panel write can never set. */
const serverForced = { create: () => false, update: () => false } as const

/**
 * Like {@link serverForced}, but ALSO `read:false` (review C3). The
 * `participantKey` is an HMAC dedup token; making it unreadable means it never
 * leaves the server via ANY API read or export, so no one (not even an admin —
 * the party anonymity protects against) can obtain it to correlate responses.
 * The submit path computes + compares it server-side (a `where` filter still
 * works — read access gates OUTPUT, not query predicates); `overrideAccess`
 * reads (tests) still see it.
 */
const secretServerField = { create: () => false, update: () => false, read: () => false } as const

/** Derives a response's `tenant` from its survey so it always matches (defense in depth). */
const deriveResponseTenant: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) {
    return data
  }
  const surveyId = toRelationId('survey' in data ? data.survey : originalDoc?.survey)
  if (surveyId === undefined) {
    return data
  }
  const survey = await req.payload.findByID({
    collection: 'surveys',
    id: surveyId,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })
  const tenantId = survey ? toRelationId(survey.tenant) : undefined
  if (tenantId !== undefined) {
    data.tenant = tenantId
  }
  return data
}

/**
 * On the FIRST response to a survey, flips the survey's `hasResponses` (via
 * `overrideAccess`, since it's write-locked). This is the second trigger
 * (besides the open window) that freezes the survey's questions (ref 2-12); the
 * survey's own `latchStartedAt` beforeChange sees `hasResponses` and stamps the
 * sticky `startedAt` latch. Idempotent (only writes when `hasResponses` isn't
 * already set); it updates `surveys`, not `surveyResponses`, so it cannot
 * re-enter itself.
 */
const markSurveyStarted: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') {
    return doc
  }
  const surveyId = toRelationId(doc.survey)
  if (surveyId === undefined) {
    return doc
  }
  const survey = await req.payload.findByID({
    collection: 'surveys',
    id: surveyId,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })
  if (survey && survey.hasResponses !== true) {
    await req.payload.update({
      collection: 'surveys',
      id: surveyId,
      data: { hasResponses: true },
      overrideAccess: true,
      req,
    })
  }
  return doc
}

/**
 * Survey responses (ref 2-12). Tenant-scoped; gated on `content.surveys` for the
 * admin (INDIVIDUAL responses are admin-only — aggregate results are served
 * separately per `survey.resultVisibility`). Every trust-sensitive field —
 * `survey`, `respondent`, `submittedAt`, `participantKey`, `tenant` — is
 * SERVER-FORCED by the hardened public submit (`src/site/survey.ts`, via
 * `overrideAccess`) and field-access-locked so an admin-panel/API write can
 * never forge them. `respondent` is null for anonymous surveys/submitters.
 */
export const SurveyResponses: CollectionConfig = {
  slug: 'surveyResponses',
  admin: {
    group: 'Content',
    useAsTitle: 'id',
    defaultColumns: ['survey', 'respondent', 'submittedAt'],
    hidden: ({ user }) => !hasMenuAccessSync(user, SURVEYS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    read: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    update: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    delete: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
  },
  // UNIQUE dedup backstops for the one-response-per-participant TOCTOU (review
  // H4): a find-then-create race is closed by the DB. Postgres treats NULLs as
  // distinct, so best-effort rows with a null key (untrusted anon) and anonymous
  // rows with a null respondent do NOT collide — only real keys/members dedupe.
  indexes: [
    { fields: ['survey', 'participantKey'], unique: true },
    { fields: ['survey', 'respondent'], unique: true },
  ],
  fields: [
    {
      name: 'survey',
      type: 'relationship',
      relationTo: 'surveys',
      required: true,
      access: serverForced,
    },
    {
      name: 'respondent',
      type: 'relationship',
      relationTo: 'members',
      access: serverForced,
      admin: {
        readOnly: true,
        description: 'The member who responded, or null (anonymous survey/submitter).',
      },
    },
    {
      name: 'submittedAt',
      type: 'date',
      access: serverForced,
      admin: { readOnly: true, description: 'Server-stamped submission time.' },
    },
    {
      name: 'participantKey',
      type: 'text',
      access: secretServerField,
      admin: {
        readOnly: true,
        description:
          'Server-only HMAC dedup key (never read back). Identity-free — enforces one-response without storing who.',
      },
    },
    {
      name: 'answers',
      type: 'array',
      access: serverForced,
      admin: { readOnly: true },
      fields: [
        { name: 'question', type: 'relationship', relationTo: 'surveyQuestions', required: true },
        {
          name: 'optionValues',
          type: 'text',
          hasMany: true,
          admin: { description: 'Selected option value(s) for single/multi questions.' },
        },
        {
          name: 'textValue',
          type: 'text',
          admin: { description: 'Free text for text/textarea questions and "other" options.' },
        },
      ],
    },
  ],
  hooks: {
    beforeValidate: [deriveResponseTenant],
    afterChange: [markSurveyStarted, responsesAudit.afterChange],
    afterDelete: [responsesAudit.afterDelete],
  },
}
