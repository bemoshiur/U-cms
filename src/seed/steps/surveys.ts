import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * Example survey on the demo site (Task 4D; refs 2-9..2-12) so results/exports
 * are exercisable out of the box. Seeds:
 *  - one OPEN survey (`duringAndAfter` results, audience `anyone`),
 *  - three questions: a single-choice with an "other" option AND a skip branch
 *    (choosing "A friend" jumps past the multi-choice question), a multi-choice,
 *    and a free-text — covering all four legacy types across the survey,
 *  - two example responses (one taking the skip path).
 *
 * IMMUTABILITY-SAFE ordering: the survey is created as a DRAFT (no `openFrom`),
 * its questions are added while it is not yet started, and only THEN is it moved
 * to open (`openFrom` in the past). Once open, its questions are frozen — exactly
 * the ref-2-12 rule. Idempotent: guarded by (tenant, title) existence.
 */

export const SURVEY_SEED_TITLE = 'Demo satisfaction survey'

function lexical(text: string) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [
        {
          type: 'paragraph',
          format: '' as const,
          indent: 0,
          version: 1,
          direction: 'ltr' as const,
          children: [
            { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
          ],
        },
      ],
    },
  }
}

export const surveysStep: SeedStep = {
  name: 'surveys',
  async run(payload: Payload) {
    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    const demoSiteId = demo.docs[0]?.id
    if (demoSiteId === undefined) {
      throw new Error('[seed:surveys] demo site not found — did sitesStep run first?')
    }

    const existing = await payload.find({
      collection: 'surveys',
      where: {
        and: [{ tenant: { equals: demoSiteId } }, { title: { equals: SURVEY_SEED_TITLE } }],
      },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) {
      payload.logger.info(`[seed:surveys] "${SURVEY_SEED_TITLE}" already exists — skipping.`)
      return
    }

    // 1) Create as a DRAFT (no openFrom → not started → questions editable).
    const survey = await payload.create({
      collection: 'surveys',
      data: {
        tenant: demoSiteId,
        title: SURVEY_SEED_TITLE,
        description: lexical('Help us improve — this short survey takes under a minute.'),
        topic: 'Customer satisfaction',
        audience: 'anyone',
        resultVisibility: 'duringAndAfter',
        anonymous: false,
        isActive: true,
      } as never,
      overrideAccess: true,
    })

    // 2) Add questions while the survey is not yet started.
    const q1 = await payload.create({
      collection: 'surveyQuestions',
      data: {
        survey: survey.id,
        order: 1,
        text: 'How did you hear about us?',
        type: 'single',
        required: true,
        options: [
          { label: 'The web', value: 'web', order: 1 },
          // Skip logic: choosing "A friend" jumps to Q3 (skips the multi Q2).
          { label: 'A friend', value: 'friend', order: 2, nextQuestionOrder: 3 },
          { label: 'Other', value: 'other', order: 3, isOther: true },
        ],
      } as never,
      overrideAccess: true,
    })
    const q2 = await payload.create({
      collection: 'surveyQuestions',
      data: {
        survey: survey.id,
        order: 2,
        text: 'Which features do you use?',
        type: 'multi',
        required: false,
        options: [
          { label: 'Boards', value: 'boards', order: 1 },
          { label: 'Surveys', value: 'surveys', order: 2 },
          { label: 'Notices', value: 'notices', order: 3 },
        ],
      } as never,
      overrideAccess: true,
    })
    const q3 = await payload.create({
      collection: 'surveyQuestions',
      data: {
        survey: survey.id,
        order: 3,
        text: 'Any suggestions for us?',
        type: 'textarea',
        required: false,
      } as never,
      overrideAccess: true,
    })

    // 3) Open the survey (openFrom in the past → now open AND started/frozen).
    const now = Date.now()
    await payload.update({
      collection: 'surveys',
      id: survey.id,
      data: {
        openFrom: new Date(now - 60 * 60 * 1000).toISOString(),
        openTo: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      overrideAccess: true,
    })

    // 4) Two example responses (the second takes the skip path past Q2).
    await payload.create({
      collection: 'surveyResponses',
      data: {
        survey: survey.id,
        respondent: null,
        submittedAt: new Date(now - 30 * 60 * 1000).toISOString(),
        tenant: demoSiteId,
        answers: [
          { question: q1.id, optionValues: ['web'] },
          { question: q2.id, optionValues: ['boards', 'surveys'] },
          { question: q3.id, textValue: 'Great service overall.' },
        ],
      } as never,
      overrideAccess: true,
    })
    await payload.create({
      collection: 'surveyResponses',
      data: {
        survey: survey.id,
        respondent: null,
        submittedAt: new Date(now - 10 * 60 * 1000).toISOString(),
        tenant: demoSiteId,
        answers: [
          { question: q1.id, optionValues: ['friend'] },
          { question: q3.id, textValue: 'Please add more options.' },
        ],
      } as never,
      overrideAccess: true,
    })

    payload.logger.info(
      `[seed:surveys] created "${SURVEY_SEED_TITLE}" with 3 questions + 2 responses.`,
    )
  },
}
