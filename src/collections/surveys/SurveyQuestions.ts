import type {
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload'
import { APIError } from 'payload'

import { hasMenuAccessSync, isSuperUser } from '../../access/hasMenuAccess'
import { getAssignedTenantIds, tenantScopedMenuAccess } from '../../access/tenantAccess'
import { auditCollection } from '../../audit/auditCollection'
import { isSurveyStarted, SURVEY_QUESTION_TYPES } from '../../content/survey'
import { toRelationId } from '../utils'
import { SURVEYS_MENU_KEY } from './defaults'

const questionsAudit = auditCollection(SURVEYS_MENU_KEY)

/** The immutability rejection message (ref 2-12 hard rule). */
const IMMUTABLE_MESSAGE =
  'This survey has started (it has responses or its open window has begun); its questions and options can no longer be added, edited, or deleted.'

async function loadSurveyStarted(
  req: Parameters<CollectionBeforeValidateHook>[0]['req'],
  surveyId: string | number | undefined,
): Promise<{ tenantId?: string | number; started: boolean } | null> {
  if (surveyId === undefined) {
    return null
  }
  const survey = await req.payload.findByID({
    collection: 'surveys',
    id: surveyId,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })
  if (!survey) {
    return null
  }
  return { tenantId: toRelationId(survey.tenant), started: isSurveyStarted(survey) }
}

/**
 * Derives a question's `tenant` from its survey, enforces the create-time
 * tenant-membership guard (the reusable T3A pattern — Payload's access `Where`
 * covers read/update/delete but not create), AND enforces the ref-2-12
 * IMMUTABILITY rule: no create/update of a question (or its options) is allowed
 * once the parent survey has STARTED. Because hooks run under `overrideAccess`
 * too, this freeze applies to the admin panel, the Local API, AND system writes
 * alike — the seed builds questions BEFORE opening its survey, never after.
 */
const deriveTenantAndEnforceImmutability: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
}) => {
  if (!data) {
    return data
  }
  const surveyId = toRelationId('survey' in data ? data.survey : originalDoc?.survey)
  const info = await loadSurveyStarted(req, surveyId)
  if (!info) {
    // `survey` is required — let the field's own required validation reject it.
    return data
  }

  // Immutability freeze (create a new question OR edit an existing one).
  if (info.started) {
    throw new APIError(IMMUTABLE_MESSAGE, 400)
  }

  // Tenant inheritance + create-time membership guard.
  if (info.tenantId !== undefined) {
    data.tenant = info.tenantId
    if (req.user && !isSuperUser(req.user)) {
      const assigned = getAssignedTenantIds(req.user)
      if (!assigned.some((id) => String(id) === String(info.tenantId))) {
        throw new APIError("You are not assigned to this survey's site (tenant).", 403)
      }
    }
  }
  return data
}

/** Rejects deleting a question once its survey has started (ref 2-12). */
const blockDeleteOnStartedSurvey: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const question = await req.payload.findByID({
    collection: 'surveyQuestions',
    id,
    depth: 0,
    overrideAccess: true,
    req,
    disableErrors: true,
  })
  if (!question) {
    return
  }
  const info = await loadSurveyStarted(req, toRelationId(question.survey))
  if (info?.started) {
    throw new APIError(IMMUTABLE_MESSAGE, 400)
  }
}

/**
 * Survey questions (refs 2-10, 2-11). Tenant-scoped (derived from the parent
 * survey), gated on `content.surveys`. The four legacy question types
 * (single/multi/text/textarea); `single`-choice options may carry per-option
 * `nextQuestionOrder` skip logic (ref 2-11), resolved by `reachableQuestionOrders`
 * in `src/content/survey.ts`. IMMUTABLE once the survey starts (ref 2-12).
 */
export const SurveyQuestions: CollectionConfig = {
  slug: 'surveyQuestions',
  admin: {
    group: 'Content',
    useAsTitle: 'text',
    defaultColumns: ['text', 'survey', 'type', 'order', 'required'],
    hidden: ({ user }) => !hasMenuAccessSync(user, SURVEYS_MENU_KEY),
  },
  access: {
    create: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    read: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    update: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
    delete: tenantScopedMenuAccess(SURVEYS_MENU_KEY),
  },
  fields: [
    { name: 'survey', type: 'relationship', relationTo: 'surveys', required: true },
    {
      name: 'order',
      type: 'number',
      defaultValue: 1,
      admin: { description: 'Display/ask order (lower first).' },
    },
    { name: 'text', type: 'text', required: true },
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'single',
      options: [
        { label: 'Single choice (radio)', value: 'single' },
        { label: 'Multiple choice (checkbox)', value: 'multi' },
        { label: 'Short text', value: 'text' },
        { label: 'Long text (textarea)', value: 'textarea' },
      ],
    },
    { name: 'required', type: 'checkbox', defaultValue: false },
    {
      name: 'options',
      type: 'array',
      labels: { singular: 'Option', plural: 'Options' },
      admin: {
        condition: (_d, sibling) => sibling?.type === 'single' || sibling?.type === 'multi',
        description:
          'Choices for single/multi questions. An "Other" option renders a free-text box.',
      },
      fields: [
        { name: 'label', type: 'text', required: true },
        {
          name: 'value',
          type: 'text',
          required: true,
          admin: { description: 'Stored value for this option (unique within the question).' },
        },
        { name: 'order', type: 'number', defaultValue: 1 },
        {
          name: 'isOther',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description: 'Renders an extra free-text input; its text is required when chosen.',
          },
        },
        {
          name: 'nextQuestionOrder',
          type: 'number',
          admin: {
            description:
              'Skip logic (single-choice only, ref 2-11): jump to the question with this order when chosen.',
          },
        },
      ],
    },
  ],
  hooks: {
    beforeValidate: [deriveTenantAndEnforceImmutability],
    beforeDelete: [blockDeleteOnStartedSurvey],
    afterChange: [questionsAudit.afterChange],
    afterDelete: [questionsAudit.afterDelete],
  },
}

/** Re-exported for the seed/tests. */
export { SURVEY_QUESTION_TYPES }
