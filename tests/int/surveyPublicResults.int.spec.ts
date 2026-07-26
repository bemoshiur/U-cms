import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { aggregateSurvey } from '@/content/survey'
import { handleSurveySummaryExport } from '@/endpoints/surveyExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { loadSurveyQuestions, loadSurveyResponses } from '@/site/survey'

/**
 * Task 5B — D3: survey verbatim free-text is withheld from PUBLIC results by
 * default, shown only when the question opts in (`includeInPublicResults`), and
 * ALWAYS present in the access-gated admin CSV export. Boots real Payload.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'
const FREE_TEXT = 'PLEASE ADD A DARK MODE'

function uniqueSiteId(): string {
  return `td3${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}
function lettersOnly(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  let out = ''
  while (n > 0) {
    out += String.fromCharCode(97 + (n % 26))
    n = Math.floor(n / 26)
  }
  return out
}

async function makeSite(): Promise<number> {
  const s = await payload.create({
    collection: 'sites',
    data: { siteId: uniqueSiteId(), name: 'D3 Site', url: 'https://d3.example.com' },
    overrideAccess: true,
  })
  return s.id
}
/** A draft survey (no window → questions still editable) with one text question + a response. */
async function makeSurveyWithText(
  tenantId: number,
  includeInPublicResults: boolean,
): Promise<{ surveyId: number; questionId: number }> {
  const survey = await payload.create({
    collection: 'surveys',
    data: {
      tenant: tenantId,
      title: `D3 survey ${lettersOnly()}`,
      audience: 'anyone',
      resultVisibility: 'duringAndAfter',
      isActive: true,
    } as never,
    overrideAccess: true,
  })
  const question = await payload.create({
    collection: 'surveyQuestions',
    data: {
      survey: survey.id,
      order: 1,
      text: 'Suggestions?',
      type: 'textarea',
      required: false,
      includeInPublicResults,
    } as never,
    overrideAccess: true,
  })
  await payload.create({
    collection: 'surveyResponses',
    data: {
      survey: survey.id,
      tenant: tenantId,
      respondent: null,
      submittedAt: new Date().toISOString(),
      answers: [{ question: question.id, optionValues: [], textValue: FREE_TEXT }],
    } as never,
    overrideAccess: true,
  })
  return { surveyId: survey.id, questionId: question.id }
}
async function makeSurveysAdmin(tenantId: number): Promise<Record<string, unknown>> {
  const grant = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: 'content.surveys' } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_SURV_${lettersOnly().toUpperCase()}`,
      name: 'surveys',
      description: 'surveys grant',
      menuGrants: [grant.docs[0]!.id],
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: `surv-${Date.now()}-${Math.floor(Math.random() * 1e5)}@example.com`,
      password: TEST_PASSWORD,
      roles: [role.id],
      tenants: [{ tenant: tenantId }],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function publicAggregate(surveyId: number) {
  const [questions, responses] = await Promise.all([
    loadSurveyQuestions(payload, surveyId),
    loadSurveyResponses(payload, surveyId),
  ])
  return aggregateSurvey(questions, responses, { audience: 'public' })
}

describe('Task 5B — D3 survey verbatim free-text public opt-in', () => {
  let siteId: number
  let admin: Record<string, unknown>

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, sitesStep])
    siteId = await makeSite()
    admin = await makeSurveysAdmin(siteId)
  })

  it('hides verbatim free-text from PUBLIC results by default (opt-in OFF)', async () => {
    const { surveyId } = await makeSurveyWithText(siteId, false)
    const agg = await publicAggregate(surveyId)
    const q = agg.questions[0]!
    expect(q.textAnswers).toEqual([])
    expect(q.verbatimSuppressed).toBe(true)
    // The aggregate count is still exposed (it is not verbatim).
    expect(q.answeredCount).toBe(1)
  })

  it('shows verbatim free-text in PUBLIC results when the question opts in', async () => {
    const { surveyId } = await makeSurveyWithText(siteId, true)
    const agg = await publicAggregate(surveyId)
    const q = agg.questions[0]!
    expect(q.textAnswers).toEqual([FREE_TEXT])
    expect(q.verbatimSuppressed).toBe(false)
  })

  it('ALWAYS includes verbatim free-text in the access-gated admin CSV export (opt-in OFF)', async () => {
    const { surveyId } = await makeSurveyWithText(siteId, false)
    // Sanity: the same survey hides it publicly ...
    const agg = await publicAggregate(surveyId)
    expect(agg.questions[0]!.textAnswers).toEqual([])
    // ... but the admin summary export includes the verbatim answer.
    const resp = await handleSurveySummaryExport({
      payload,
      user: admin,
      id: surveyId,
    })
    expect(resp.status).toBe(200)
    const csv = await resp.text()
    expect(csv).toContain(FREE_TEXT)
  })
})
