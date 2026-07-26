import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import type { SubmittedAnswer } from '@/content/survey'
import { handleSurveyResponsesExport, handleSurveySummaryExport } from '@/endpoints/surveyExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { surveysStep, SURVEY_SEED_TITLE } from '@/seed/steps/surveys'
import type { CurrentMember } from '@/site/member'
import { submitSurveyResponse, SurveyError } from '@/site/survey'

let payload: Payload

const TEST_PASSWORD = 'a-long-enough-test-password-1'
const HOUR = 60 * 60 * 1000

function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}
function uniqueSiteId(label: string): string {
  return `s${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
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
const past = (ms: number) => new Date(Date.now() - ms).toISOString()
const future = (ms: number) => new Date(Date.now() + ms).toISOString()
const sub = (entries: [number, SubmittedAnswer][]) => new Map<number, SubmittedAnswer>(entries)

describe('surveys: questions, responses, results, exports (Task 4D)', () => {
  let demoSiteId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])
    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    demoSiteId = demo.docs[0]!.id
  })

  /** Creates a DRAFT survey (no openFrom → questions still editable). */
  async function makeDraftSurvey(
    tenantId: number,
    overrides: Record<string, unknown> = {},
  ): Promise<number> {
    const s = await payload.create({
      collection: 'surveys',
      data: {
        tenant: tenantId,
        title: marker('Survey'),
        audience: 'anyone',
        resultVisibility: 'duringAndAfter',
        isActive: true,
        ...overrides,
      } as never,
      overrideAccess: true,
    })
    return s.id
  }

  async function addQuestion(surveyId: number, data: Record<string, unknown>): Promise<number> {
    const q = await payload.create({
      collection: 'surveyQuestions',
      data: { survey: surveyId, ...data } as never,
      overrideAccess: true,
    })
    return q.id
  }

  async function openSurvey(surveyId: number): Promise<void> {
    await payload.update({
      collection: 'surveys',
      id: surveyId,
      data: { openFrom: past(HOUR), openTo: future(24 * HOUR) },
      overrideAccess: true,
    })
  }

  /** A standard 3-question survey (single w/ skip + other, multi, textarea), still draft. */
  async function makeStandardQuestions(surveyId: number) {
    const q1 = await addQuestion(surveyId, {
      order: 1,
      text: 'How did you hear about us?',
      type: 'single',
      required: true,
      options: [
        { label: 'Web', value: 'web', order: 1 },
        { label: 'Friend', value: 'friend', order: 2, nextQuestionOrder: 3 },
        { label: 'Other', value: 'other', order: 3, isOther: true },
      ],
    })
    const q2 = await addQuestion(surveyId, {
      order: 2,
      text: 'Which features?',
      type: 'multi',
      required: true,
      options: [
        { label: 'A', value: 'a', order: 1 },
        { label: 'B', value: 'b', order: 2 },
      ],
    })
    const q3 = await addQuestion(surveyId, {
      order: 3,
      text: 'Suggestions?',
      type: 'textarea',
      required: false,
    })
    return { q1, q2, q3 }
  }

  // ── question immutability (ref 2-12 hard rule) ─────────────────────────────
  describe('question immutability once started', () => {
    it('allows editing questions while the survey is a draft', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId)
      const qId = await addQuestion(surveyId, { order: 1, text: 'Q', type: 'text' })
      const updated = await payload.update({
        collection: 'surveyQuestions',
        id: qId,
        data: { text: 'Q edited' },
        overrideAccess: true,
      })
      expect(updated.text).toBe('Q edited')
    })

    it('rejects add/edit/delete once the survey window has opened', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId)
      const qId = await addQuestion(surveyId, { order: 1, text: 'Q', type: 'text' })
      await openSurvey(surveyId)

      // add
      await expect(
        payload.create({
          collection: 'surveyQuestions',
          data: { survey: surveyId, order: 2, text: 'New', type: 'text' } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
      // edit
      await expect(
        payload.update({
          collection: 'surveyQuestions',
          id: qId,
          data: { text: 'nope' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
      // delete
      await expect(
        payload.delete({ collection: 'surveyQuestions', id: qId, overrideAccess: true }),
      ).rejects.toThrow()
    })

    it('freezes questions once the FIRST response arrives (even before openFrom)', async () => {
      // A survey open via null-openFrom-with-active is "open" (unbounded); build
      // questions first, then a response flips hasResponses → started.
      const surveyId = await makeDraftSurvey(demoSiteId, { openTo: future(24 * HOUR) })
      const { q3 } = await makeStandardQuestions(surveyId)
      // No openFrom → not started yet; editing q3 still allowed.
      await payload.update({
        collection: 'surveyQuestions',
        id: q3,
        data: { text: 'Suggestions? (v2)' },
        overrideAccess: true,
      })
      // Record a response → hasResponses true → started.
      await submitSurveyResponse(
        payload,
        { surveyId, submittedByOrder: sub([[1, { optionValues: ['friend'] }]]) },
        { member: null, clientIp: '10.1.1.1' },
      )
      const survey = await payload.findByID({
        collection: 'surveys',
        id: surveyId,
        overrideAccess: true,
      })
      expect(survey.hasResponses).toBe(true)
      await expect(
        payload.update({
          collection: 'surveyQuestions',
          id: q3,
          data: { text: 'blocked' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  // ── response validation ────────────────────────────────────────────────────
  describe('response validation (server-forced + rules)', () => {
    it('rejects a missing required answer; accepts a valid full submission', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId)
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)

      // Q1 required not answered.
      await expect(
        submitSurveyResponse(
          payload,
          { surveyId, submittedByOrder: sub([[2, { optionValues: ['a'] }]]) },
          { member: null, clientIp: '10.2.2.1' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)

      const res = await submitSurveyResponse(
        payload,
        {
          surveyId,
          submittedByOrder: sub([
            [1, { optionValues: ['web'] }],
            [2, { optionValues: ['a', 'b'] }],
            [3, { textValue: 'Nice' }],
          ]),
        },
        { member: null, clientIp: '10.2.2.2' },
      )
      const stored = await payload.findByID({
        collection: 'surveyResponses',
        id: res.id,
        overrideAccess: true,
      })
      // survey + submittedAt server-forced; respondent null (anonymous submitter).
      expect(toRelationId(stored.survey)).toBe(surveyId)
      expect(stored.submittedAt).toBeTruthy()
      expect(stored.respondent).toBeNull()
      expect(stored.answers).toHaveLength(3)
    })

    it('enforces single-choice cardinality and option membership', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId)
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)
      // two values for single
      await expect(
        submitSurveyResponse(
          payload,
          {
            surveyId,
            submittedByOrder: sub([
              [1, { optionValues: ['web', 'friend'] }],
              [2, { optionValues: ['a'] }],
            ]),
          },
          { member: null, clientIp: '10.3.3.1' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
      // value not in question
      await expect(
        submitSurveyResponse(
          payload,
          {
            surveyId,
            submittedByOrder: sub([
              [1, { optionValues: ['bogus'] }],
              [2, { optionValues: ['a'] }],
            ]),
          },
          { member: null, clientIp: '10.3.3.2' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
    })

    it('requires the "other" free text when an other option is chosen', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId)
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)
      await expect(
        submitSurveyResponse(
          payload,
          {
            surveyId,
            submittedByOrder: sub([
              [1, { optionValues: ['other'] }],
              [2, { optionValues: ['a'] }],
            ]),
          },
          { member: null, clientIp: '10.4.4.1' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
    })

    it('accepts a valid skip path (required Q2 skipped by the branch)', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId)
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)
      const res = await submitSurveyResponse(
        payload,
        { surveyId, submittedByOrder: sub([[1, { optionValues: ['friend'] }]]) },
        { member: null, clientIp: '10.5.5.1' },
      )
      expect(res.id).toBeDefined()
    })

    it('rejects a submission to a CLOSED survey', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId, {
        openTo: past(HOUR),
        openFrom: past(2 * HOUR),
      })
      // questions were addable before openFrom? openFrom is in the past → started.
      // Build questions on a separate draft, then close. Simpler: this survey has
      // no questions; a closed survey rejects regardless.
      await expect(
        submitSurveyResponse(
          payload,
          { surveyId, submittedByOrder: sub([]) },
          { member: null, clientIp: '10.6.6.1' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
    })

    it('rejects profanity in free text without echoing the word', async () => {
      const word = `zzsurv${lettersOnly()}`
      await payload.create({
        collection: 'profanityWords',
        data: { word, isActive: true },
        overrideAccess: true,
      })
      const surveyId = await makeDraftSurvey(demoSiteId)
      const { q1 } = await makeStandardQuestions(surveyId)
      void q1
      await openSurvey(surveyId)
      let threw: unknown
      try {
        await submitSurveyResponse(
          payload,
          {
            surveyId,
            submittedByOrder: sub([
              [1, { optionValues: ['web'] }],
              [2, { optionValues: ['a'] }],
              [3, { textValue: `here is ${word} text` }],
            ]),
          },
          { member: null, clientIp: '10.7.7.1' },
        )
      } catch (e) {
        threw = e
      }
      expect(threw).toBeInstanceOf(SurveyError)
      expect(String((threw as { message?: string })?.message)).not.toContain(word)
    })
  })

  // ── audience + anonymity + one-response ────────────────────────────────────
  describe('audience, anonymity, one-response', () => {
    async function makeMember(tenantId: number): Promise<CurrentMember> {
      const m = await payload.create({
        collection: 'members',
        data: {
          loginId: `sm${lettersOnly()}`,
          email: `${marker('m')}@example.com`,
          name: 'Survey Member',
          password: TEST_PASSWORD,
          status: 'active',
          tenant: tenantId,
        } as never,
        overrideAccess: true,
      })
      return { id: m.id, name: 'Survey Member', loginId: 'x', tenant: tenantId }
    }

    it('members-only survey rejects an anonymous submitter (login required)', async () => {
      const surveyId = await makeDraftSurvey(demoSiteId, { audience: 'members' })
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)
      await expect(
        submitSurveyResponse(
          payload,
          {
            surveyId,
            submittedByOrder: sub([
              [1, { optionValues: ['web'] }],
              [2, { optionValues: ['a'] }],
            ]),
          },
          { member: null, clientIp: '10.8.8.1' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
    })

    it('records the member as respondent and enforces one-response-per-member', async () => {
      const member = await makeMember(demoSiteId)
      const surveyId = await makeDraftSurvey(demoSiteId, { audience: 'members', anonymous: false })
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)

      const res = await submitSurveyResponse(
        payload,
        {
          surveyId,
          submittedByOrder: sub([
            [1, { optionValues: ['web'] }],
            [2, { optionValues: ['a'] }],
          ]),
        },
        { member, clientIp: '10.9.9.1' },
      )
      const stored = await payload.findByID({
        collection: 'surveyResponses',
        id: res.id,
        overrideAccess: true,
      })
      expect(toRelationId(stored.respondent)).toBe(member!.id)

      // second attempt by same member → rejected.
      await expect(
        submitSurveyResponse(
          payload,
          { surveyId, submittedByOrder: sub([[1, { optionValues: ['friend'] }]]) },
          { member, clientIp: '10.9.9.2' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
    })

    it('anonymous survey stores a null respondent but still dedupes one-per-member (hashed)', async () => {
      const member = await makeMember(demoSiteId)
      const surveyId = await makeDraftSurvey(demoSiteId, { audience: 'members', anonymous: true })
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)

      const res = await submitSurveyResponse(
        payload,
        {
          surveyId,
          submittedByOrder: sub([
            [1, { optionValues: ['web'] }],
            [2, { optionValues: ['a'] }],
          ]),
        },
        { member, clientIp: null },
      )
      const stored = await payload.findByID({
        collection: 'surveyResponses',
        id: res.id,
        overrideAccess: true,
      })
      expect(stored.respondent).toBeNull()
      expect(stored.participantKey).toBeTruthy()

      // same member again → deduped via the hashed key despite anonymity.
      await expect(
        submitSurveyResponse(
          payload,
          { surveyId, submittedByOrder: sub([[1, { optionValues: ['friend'] }]]) },
          { member, clientIp: null },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
    })

    it('a member from another site cannot answer a members-only survey', async () => {
      const otherSite = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('os'), name: 'Other', url: 'https://other.example.com' },
        overrideAccess: true,
      })
      const foreignMember = await makeMember(otherSite.id)
      const surveyId = await makeDraftSurvey(demoSiteId, { audience: 'members' })
      await makeStandardQuestions(surveyId)
      await openSurvey(surveyId)
      await expect(
        submitSurveyResponse(
          payload,
          {
            surveyId,
            submittedByOrder: sub([
              [1, { optionValues: ['web'] }],
              [2, { optionValues: ['a'] }],
            ]),
          },
          { member: foreignMember, clientIp: '10.10.10.1' },
        ),
      ).rejects.toBeInstanceOf(SurveyError)
    })
  })

  // ── tenant scoping + exports ───────────────────────────────────────────────
  describe('tenant scoping + CSV exports', () => {
    let siteAId: number
    let siteBId: number
    let surveyAId: number
    let userA: Awaited<ReturnType<typeof payload.create>>
    let userB: Awaited<ReturnType<typeof payload.create>>
    let superUser: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const siteA = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('va'), name: 'Surveys A', url: 'https://sva.example.com' },
        overrideAccess: true,
      })
      const siteB = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('vb'), name: 'Surveys B', url: 'https://svb.example.com' },
        overrideAccess: true,
      })
      siteAId = siteA.id
      siteBId = siteB.id

      surveyAId = await makeDraftSurvey(siteAId)
      await makeStandardQuestions(surveyAId)
      await openSurvey(surveyAId)
      // A couple of responses on survey A.
      await submitSurveyResponse(
        payload,
        {
          surveyId: surveyAId,
          submittedByOrder: sub([
            [1, { optionValues: ['web'] }],
            [2, { optionValues: ['a', 'b'] }],
            [3, { textValue: 'Good' }],
          ]),
        },
        { member: null, clientIp: '10.20.0.1' },
      )
      await submitSurveyResponse(
        payload,
        {
          surveyId: surveyAId,
          submittedByOrder: sub([
            [1, { optionValues: ['friend'] }],
            [3, { textValue: 'More' }],
          ]),
        },
        { member: null, clientIp: '10.20.0.2' },
      )

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
          roleId: `ROLE_TEST_SURVEYS_${lettersOnly().toUpperCase()}`,
          name: 'Surveys-only test role',
          description: 'Grants content.surveys only (non-super).',
          menuGrants: [surveysMenuId],
        },
        overrideAccess: true,
      })
      userA = await payload.create({
        collection: 'users',
        data: {
          email: `sua-${marker('a')}@example.com`,
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
          email: `sub-${marker('b')}@example.com`,
          password: TEST_PASSWORD,
          roles: [scopedRole.id],
          tenants: [{ tenant: siteBId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      const superRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_SUPER_${lettersOnly().toUpperCase()}`,
          name: 'Super',
          description: 'isSuper test role.',
          isSuper: true,
        },
        overrideAccess: true,
      })
      superUser = await payload.create({
        collection: 'users',
        data: {
          email: `suu-${marker('u')}@example.com`,
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })
    })

    it('denies a cross-tenant user reading another site survey/response', async () => {
      // userB (site B) reading site A survey → filtered out (null).
      const readAsB = await payload.findByID({
        collection: 'surveys',
        id: surveyAId,
        overrideAccess: false,
        user: userB,
        disableErrors: true,
      })
      expect(readAsB).toBeNull()
      // userA (site A) CAN read it.
      const readAsA = await payload.findByID({
        collection: 'surveys',
        id: surveyAId,
        overrideAccess: false,
        user: userA,
        disableErrors: true,
      })
      expect(readAsA?.id).toBe(surveyAId)
    })

    it('summary export: gated + tenant-scoped + correct aggregate rows', async () => {
      const ok = await handleSurveySummaryExport({ payload, user: userA, id: surveyAId })
      expect(ok.status).toBe(200)
      expect(ok.headers.get('content-type')).toContain('text/csv')
      const csv = await ok.text()
      expect(csv).toContain('Total responses')
      expect(csv).toContain('How did you hear about us?')
      expect(csv).toContain('Web')

      // cross-tenant caller → 404 (existence oracle collapse).
      const crossTenant = await handleSurveySummaryExport({ payload, user: userB, id: surveyAId })
      expect(crossTenant.status).toBe(404)
      // anonymous → 404.
      const anon = await handleSurveySummaryExport({ payload, user: null, id: surveyAId })
      expect(anon.status).toBe(404)
    })

    it('responses export: one row per response, admin/tenant-gated', async () => {
      const ok = await handleSurveyResponsesExport({ payload, user: superUser, id: surveyAId })
      expect(ok.status).toBe(200)
      const csv = await ok.text()
      const lines = csv.trim().split('\r\n')
      // header + 2 responses.
      expect(lines.length).toBe(3)
      expect(lines[0]).toContain('Response #')

      const crossTenant = await handleSurveyResponsesExport({ payload, user: userB, id: surveyAId })
      expect(crossTenant.status).toBe(404)
    })
  })

  // ── seed ───────────────────────────────────────────────────────────────────
  describe('seed', () => {
    it('seeds one open survey with 3 questions + 2 responses idempotently', async () => {
      await runSeed(payload, [surveysStep])
      await runSeed(payload, [surveysStep])

      const found = await payload.find({
        collection: 'surveys',
        where: {
          and: [{ tenant: { equals: demoSiteId } }, { title: { equals: SURVEY_SEED_TITLE } }],
        },
        limit: 2,
        pagination: false,
        overrideAccess: true,
      })
      expect(found.docs).toHaveLength(1)
      const surveyId = found.docs[0]!.id

      const questions = await payload.find({
        collection: 'surveyQuestions',
        where: { survey: { equals: surveyId } },
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
      expect(questions.docs).toHaveLength(3)

      const responses = await payload.find({
        collection: 'surveyResponses',
        where: { survey: { equals: surveyId } },
        limit: 0,
        pagination: false,
        overrideAccess: true,
      })
      expect(responses.docs).toHaveLength(2)
    })
  })
})
