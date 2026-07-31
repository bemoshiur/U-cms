import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { handleSurveyResultsView } from '@/endpoints/surveyResults'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'

/**
 * Audit Fix 5 (ref 2-12) — the survey admin RESULTS endpoint
 * (`GET /api/surveys/:id/results`) that backs the `beforeDocumentControls`
 * "View results" panel on the survey edit screen (`SurveyResultsPanel.tsx`).
 * Proves:
 *  - an admin holding the `content.surveys` grant on the survey's own tenant
 *    gets back the correct aggregate counts for known seeded responses
 *    (mirrors what the panel renders via `SurveyResults`), and
 *  - a caller without that access (cross-tenant admin, or anonymous) cannot
 *    reach the underlying data — both collapse to the same 404, matching the
 *    existing CSV-export endpoints' existence-oracle posture.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'

function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}
function uniqueSiteId(label: string): string {
  return `sr${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
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

describe('survey admin results endpoint (Audit Fix 5)', () => {
  let siteAId: number
  let siteBId: number
  let surveyAId: number
  let userA: Awaited<ReturnType<typeof payload.create>>
  let userB: Awaited<ReturnType<typeof payload.create>>

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])

    const siteA = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('a'), name: 'Results A', url: 'https://ra.example.com' },
      overrideAccess: true,
    })
    const siteB = await payload.create({
      collection: 'sites',
      data: { siteId: uniqueSiteId('b'), name: 'Results B', url: 'https://rb.example.com' },
      overrideAccess: true,
    })
    siteAId = siteA.id
    siteBId = siteB.id

    // A survey with one single-choice question + two known responses.
    const survey = await payload.create({
      collection: 'surveys',
      data: {
        tenant: siteAId,
        title: marker('Results survey'),
        audience: 'anyone',
        resultVisibility: 'adminsOnly', // public-visibility irrelevant — admin always sees results
        isActive: true,
      } as never,
      overrideAccess: true,
    })
    surveyAId = survey.id
    const question = await payload.create({
      collection: 'surveyQuestions',
      data: {
        survey: surveyAId,
        order: 1,
        text: 'Favorite color?',
        type: 'single',
        required: true,
        options: [
          { label: 'Red', value: 'red', order: 1 },
          { label: 'Blue', value: 'blue', order: 2 },
        ],
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'surveyResponses',
      data: {
        survey: surveyAId,
        tenant: siteAId,
        respondent: null,
        submittedAt: new Date().toISOString(),
        answers: [{ question: question.id, optionValues: ['red'] }],
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'surveyResponses',
      data: {
        survey: surveyAId,
        tenant: siteAId,
        respondent: null,
        submittedAt: new Date().toISOString(),
        answers: [{ question: question.id, optionValues: ['red'] }],
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'surveyResponses',
      data: {
        survey: surveyAId,
        tenant: siteAId,
        respondent: null,
        submittedAt: new Date().toISOString(),
        answers: [{ question: question.id, optionValues: ['blue'] }],
      } as never,
      overrideAccess: true,
    })

    const surveysMenu = await payload.find({
      collection: 'adminMenus',
      where: { menuKey: { equals: 'content.surveys' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const surveysMenuId = surveysMenu.docs[0]!.id
    const scopedRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_TEST_RESULTS_${lettersOnly().toUpperCase()}`,
        name: 'Surveys-only test role (results)',
        description: 'Grants content.surveys only (non-super).',
        menuGrants: [surveysMenuId],
      },
      overrideAccess: true,
    })
    userA = await payload.create({
      collection: 'users',
      data: {
        email: `rua-${marker('a')}@example.com`,
        password: TEST_PASSWORD,
        roles: [scopedRole.id],
        tenants: [{ tenant: siteAId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
    userB = await payload.create({
      collection: 'users',
      data: {
        email: `rub-${marker('b')}@example.com`,
        password: TEST_PASSWORD,
        roles: [scopedRole.id],
        tenants: [{ tenant: siteBId }],
        status: 'active',
      } as never,
      overrideAccess: true,
    })
  })

  it('returns correct aggregate counts for an admin with access, regardless of resultVisibility', async () => {
    const resp = await handleSurveyResultsView({ payload, user: userA, id: surveyAId })
    expect(resp.status).toBe(200)
    const body = (await resp.json()) as {
      ok: boolean
      survey?: { id: number | string; title: string }
      aggregate?: {
        totalResponses: number
        questions: { text: string; options: { value: string; count: number }[] }[]
      }
    }
    expect(body.ok).toBe(true)
    expect(body.survey?.id).toBe(surveyAId)
    expect(body.aggregate?.totalResponses).toBe(3)
    const q = body.aggregate?.questions[0]
    expect(q?.text).toBe('Favorite color?')
    const red = q?.options.find((o) => o.value === 'red')
    const blue = q?.options.find((o) => o.value === 'blue')
    expect(red?.count).toBe(2)
    expect(blue?.count).toBe(1)
  })

  it('collapses a cross-tenant admin to 404 (cannot reach another site survey results)', async () => {
    const resp = await handleSurveyResultsView({ payload, user: userB, id: surveyAId })
    expect(resp.status).toBe(404)
    const body = (await resp.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it('collapses an anonymous caller to 404 (non-privileged caller cannot reach the data)', async () => {
    const resp = await handleSurveyResultsView({ payload, user: null, id: surveyAId })
    expect(resp.status).toBe(404)
  })

  it('400s a missing id (request-shape error, not a resource-existence leak)', async () => {
    const resp = await handleSurveyResultsView({ payload, user: userA, id: undefined })
    expect(resp.status).toBe(400)
  })
})
