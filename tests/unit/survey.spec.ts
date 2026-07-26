import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'

import {
  aggregateSurvey,
  computeParticipantKey,
  isSurveyOpen,
  isSurveyStarted,
  reachableQuestionOrders,
  resultsVisible,
  surveyStatus,
  validateSurveyAnswers,
  type SubmittedAnswer,
  type SurveyQuestionLike,
} from '@/content/survey'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-07-26T12:00:00.000Z')
const past = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const future = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

describe('surveyStatus / isSurveyOpen', () => {
  it('an inactive survey is always closed', () => {
    expect(surveyStatus({ isActive: false, openFrom: past(HOUR) }, NOW)).toBe('closed')
  })
  it('is scheduled before openFrom', () => {
    expect(surveyStatus({ isActive: true, openFrom: future(HOUR) }, NOW)).toBe('scheduled')
  })
  it('is open within the window (or when unbounded)', () => {
    expect(surveyStatus({ isActive: true, openFrom: past(HOUR), openTo: future(HOUR) }, NOW)).toBe(
      'open',
    )
    expect(surveyStatus({ isActive: true }, NOW)).toBe('open')
    expect(isSurveyOpen({ isActive: true, openFrom: past(HOUR) }, NOW)).toBe(true)
  })
  it('is closed after openTo', () => {
    expect(surveyStatus({ isActive: true, openTo: past(HOUR) }, NOW)).toBe('closed')
    expect(isSurveyOpen({ isActive: true, openTo: past(HOUR) }, NOW)).toBe(false)
  })
})

describe('isSurveyStarted (question freeze trigger)', () => {
  it('a draft with no openFrom and no responses is NOT started', () => {
    expect(isSurveyStarted({ isActive: true }, NOW)).toBe(false)
  })
  it('is started once it has responses', () => {
    expect(isSurveyStarted({ hasResponses: true }, NOW)).toBe(true)
  })
  it('is started once the window has opened (openFrom in the past)', () => {
    expect(isSurveyStarted({ openFrom: past(HOUR) }, NOW)).toBe(true)
  })
  it('is NOT started while still scheduled (openFrom in the future)', () => {
    expect(isSurveyStarted({ openFrom: future(HOUR) }, NOW)).toBe(false)
  })
})

describe('resultsVisible', () => {
  it('admins always see results', () => {
    expect(resultsVisible({ resultVisibility: 'adminsOnly' }, 'admin', NOW)).toBe(true)
  })
  it('adminsOnly hides public results', () => {
    expect(
      resultsVisible(
        { resultVisibility: 'adminsOnly', isActive: true, openTo: past(HOUR) },
        'public',
        NOW,
      ),
    ).toBe(false)
  })
  it('afterClose shows public results only once closed', () => {
    expect(
      resultsVisible(
        { resultVisibility: 'afterClose', isActive: true, openFrom: past(HOUR) },
        'public',
        NOW,
      ),
    ).toBe(false)
    expect(
      resultsVisible(
        { resultVisibility: 'afterClose', isActive: true, openTo: past(HOUR) },
        'public',
        NOW,
      ),
    ).toBe(true)
  })
  it('duringAndAfter shows while open and after close, but not while scheduled', () => {
    expect(
      resultsVisible(
        { resultVisibility: 'duringAndAfter', isActive: true, openFrom: past(HOUR) },
        'public',
        NOW,
      ),
    ).toBe(true)
    expect(
      resultsVisible(
        { resultVisibility: 'duringAndAfter', isActive: true, openTo: past(HOUR) },
        'public',
        NOW,
      ),
    ).toBe(true)
    expect(
      resultsVisible(
        { resultVisibility: 'duringAndAfter', isActive: true, openFrom: future(HOUR) },
        'public',
        NOW,
      ),
    ).toBe(false)
  })
})

const QUESTIONS: SurveyQuestionLike[] = [
  {
    id: 1,
    order: 1,
    text: 'How did you hear about us?',
    type: 'single',
    required: true,
    options: [
      { label: 'Web', value: 'web' },
      { label: 'Friend', value: 'friend', nextQuestionOrder: 3 },
      { label: 'Other', value: 'other', isOther: true },
    ],
  },
  {
    id: 2,
    order: 2,
    text: 'Which features?',
    type: 'multi',
    required: true,
    options: [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ],
  },
  { id: 3, order: 3, text: 'Suggestions?', type: 'textarea', required: false },
]

describe('reachableQuestionOrders (skip logic)', () => {
  it('walks linearly when no skip option is chosen', () => {
    const reachable = reachableQuestionOrders(QUESTIONS, new Map([[1, ['web']]]))
    expect([...reachable].sort()).toEqual([1, 2, 3])
  })
  it('jumps past Q2 when the skip option is chosen', () => {
    const reachable = reachableQuestionOrders(QUESTIONS, new Map([[1, ['friend']]]))
    expect(reachable.has(1)).toBe(true)
    expect(reachable.has(2)).toBe(false)
    expect(reachable.has(3)).toBe(true)
  })
})

describe('validateSurveyAnswers', () => {
  const sub = (entries: [number, SubmittedAnswer][]) => new Map<number, SubmittedAnswer>(entries)

  it('rejects a missing required single-choice answer', () => {
    const r = validateSurveyAnswers(QUESTIONS, sub([[2, { optionValues: ['a'] }]]))
    expect(r.errorMessage).toBeDefined()
  })
  it('rejects an option value not belonging to the question', () => {
    const r = validateSurveyAnswers(QUESTIONS, sub([[1, { optionValues: ['nope'] }]]))
    expect(r.errorMessage).toBeDefined()
  })
  it('rejects selecting two options for a single-choice question', () => {
    const r = validateSurveyAnswers(QUESTIONS, sub([[1, { optionValues: ['web', 'friend'] }]]))
    expect(r.errorMessage).toContain('only one')
  })
  it('rejects an "other" selection with no free text', () => {
    const r = validateSurveyAnswers(QUESTIONS, sub([[1, { optionValues: ['other'] }]]))
    expect(r.errorMessage).toContain('other')
  })
  it('rejects a required multi-choice with no selection (reachable path)', () => {
    const r = validateSurveyAnswers(QUESTIONS, sub([[1, { optionValues: ['web'] }]]))
    expect(r.errorMessage).toBeDefined()
  })
  it('ACCEPTS a valid skip path (required Q2 skipped)', () => {
    const r = validateSurveyAnswers(QUESTIONS, sub([[1, { optionValues: ['friend'] }]]))
    expect(r.errorMessage).toBeUndefined()
    expect(r.answers).toHaveLength(1)
    expect(r.answers[0]).toMatchObject({ questionId: 1, optionValues: ['friend'] })
  })
  it('accepts a full valid submission and collects free text + other text', () => {
    const r = validateSurveyAnswers(
      QUESTIONS,
      sub([
        [1, { optionValues: ['other'], textValue: 'Radio ad' }],
        [2, { optionValues: ['a', 'b'] }],
        [3, { textValue: 'Keep it up' }],
      ]),
    )
    expect(r.errorMessage).toBeUndefined()
    expect(r.answers).toHaveLength(3)
    expect(r.freeTexts).toContain('Radio ad')
    expect(r.freeTexts).toContain('Keep it up')
  })
})

describe('aggregateSurvey', () => {
  it('counts option selections with percentages and lists text answers', () => {
    const responses = [
      {
        answers: [
          { question: 1, optionValues: ['web'] },
          { question: 2, optionValues: ['a', 'b'] },
          { question: 3, textValue: 'Nice' },
        ],
      },
      {
        answers: [
          { question: 1, optionValues: ['friend'] },
          { question: 3, textValue: 'More options' },
        ],
      },
    ]
    const agg = aggregateSurvey(QUESTIONS, responses)
    expect(agg.totalResponses).toBe(2)

    const q1 = agg.questions.find((q) => q.questionId === 1)!
    expect(q1.answeredCount).toBe(2)
    expect(q1.options.find((o) => o.value === 'web')!.count).toBe(1)
    expect(q1.options.find((o) => o.value === 'web')!.percentage).toBe(50)

    const q2 = agg.questions.find((q) => q.questionId === 2)!
    expect(q2.answeredCount).toBe(1)
    expect(q2.options.find((o) => o.value === 'a')!.count).toBe(1)
    expect(q2.options.find((o) => o.value === 'a')!.percentage).toBe(100)

    const q3 = agg.questions.find((q) => q.questionId === 3)!
    expect(q3.textAnswers.sort()).toEqual(['More options', 'Nice'])
  })
})

describe('computeParticipantKey (HMAC, review C3)', () => {
  const SECRET = 'server-secret-A'
  it('is deterministic and identity-free from a member id', () => {
    const a = computeParticipantKey(5, { memberId: 42 }, SECRET)
    const b = computeParticipantKey(5, { memberId: 42 }, SECRET)
    expect(a).toBe(b)
    expect(a).not.toContain('42')
  })
  it('differs across surveys for the same member', () => {
    expect(computeParticipantKey(5, { memberId: 42 }, SECRET)).not.toBe(
      computeParticipantKey(6, { memberId: 42 }, SECRET),
    )
  })
  it('falls back to the client IP, and is null when neither is available', () => {
    expect(computeParticipantKey(5, { clientIp: '1.2.3.4' }, SECRET)).toBeTruthy()
    expect(computeParticipantKey(5, {}, SECRET)).toBeNull()
  })
  it('prefers the member id over the IP (one-per-member even when anonymous)', () => {
    const withIp = computeParticipantKey(5, { memberId: 42, clientIp: '1.2.3.4' }, SECRET)
    const withoutIp = computeParticipantKey(5, { memberId: 42 }, SECRET)
    expect(withIp).toBe(withoutIp)
  })
  it('is NOT recomputable without the secret — two secrets yield different keys', () => {
    const withA = computeParticipantKey(5, { memberId: 42 }, 'server-secret-A')
    const withB = computeParticipantKey(5, { memberId: 42 }, 'server-secret-B')
    expect(withA).not.toBe(withB)
    // A bare sha256(surveyId:m:id) — what an admin could otherwise recompute to
    // de-anonymize — must NOT match the HMAC.
    const bareHash = createHash('sha256').update('5:m:42').digest('hex')
    expect(withA).not.toBe(bareHash)
  })
})
