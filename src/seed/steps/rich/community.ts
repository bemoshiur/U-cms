import type { Payload } from 'payload'

import { buildTermsConsents } from '../../../members/terms'
import type { SeedStep } from '../../types'
import { DEFAULT_SEED_MEMBER_PASSWORD, assertSeedMemberPasswordSafeForProduction } from '../members'
import { RICH_MEMBER_COUNT, RICH_MEMBER_NAMES, daysAgoISO, lexical, siteIdBySiteId } from './shared'

/**
 * A realistic roster of active public members on the demo site (owner mandate:
 * ~15-25 members so member management + survey attribution look real). Layered
 * on top of `membersStep` (demo-member + pending-member). All are `active` and
 * share the member password source (`SEED_MEMBER_PASSWORD`, dev default
 * `Pulse-Member-2026`); the production fail-fast is enforced on the create path
 * so a public deploy never gets a KNOWN default password. Each snapshots the
 * active terms as consent evidence. Idempotent by (tenant, loginId).
 */
export const richMembersStep: SeedStep = {
  name: 'rich-members',
  async run(payload: Payload) {
    const tenantId = await siteIdBySiteId(payload, 'demo')

    const usingDefaultPassword = !process.env.SEED_MEMBER_PASSWORD
    const password = process.env.SEED_MEMBER_PASSWORD || DEFAULT_SEED_MEMBER_PASSWORD
    let warnedDefault = false

    for (let i = 1; i <= RICH_MEMBER_COUNT; i++) {
      const loginId = `member${String(i).padStart(2, '0')}`
      const existing = await payload.find({
        collection: 'members',
        where: { and: [{ tenant: { equals: tenantId } }, { loginId: { equals: loginId } }] },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) {
        continue
      }

      if (usingDefaultPassword) {
        assertSeedMemberPasswordSafeForProduction()
        if (!warnedDefault) {
          payload.logger.warn(
            '[seed:rich-members] SEED_MEMBER_PASSWORD is not set — seeding demo members with a ' +
              'development-only default password. Not safe outside local dev.',
          )
          warnedDefault = true
        }
      }

      const name = RICH_MEMBER_NAMES[(i - 1) % RICH_MEMBER_NAMES.length] as string
      await payload.create({
        collection: 'members',
        data: {
          loginId,
          email: `${loginId}@demo.example.com`,
          name,
          mobile: `010-3000-${String(1000 + i).padStart(4, '0')}`,
          password,
          status: 'active',
          tenant: tenantId,
          marketingConsent: i % 3 === 0,
          termsConsents: await buildTermsConsents(payload, tenantId),
          createdAt: daysAgoISO(210 - i * 10 > 0 ? 210 - i * 10 : 5),
        } as never,
        overrideAccess: true,
      })
      payload.logger.info(`[seed:rich-members] created member "${loginId}".`)
    }
  },
}

// ── Surveys ────────────────────────────────────────────────────────────────

type QuestionSeed = {
  order: number
  text: string
  type: 'single' | 'multi' | 'text' | 'textarea'
  required?: boolean
  options?: {
    label: string
    value: string
    order: number
    isOther?: boolean
    nextQuestionOrder?: number
  }[]
  includeInPublicResults?: boolean
}

type SurveySeed = {
  title: string
  topic: string
  audience: 'anyone' | 'members'
  resultVisibility: 'afterClose' | 'duringAndAfter' | 'adminsOnly'
  /** Lifecycle: open (past→future), closed (past→past), scheduled (future→future). */
  lifecycle: 'open' | 'closed' | 'scheduled'
  questions: QuestionSeed[]
  responseCount: number
}

const SURVEY_SEEDS: SurveySeed[] = [
  {
    title: '2026 Public Services Satisfaction Survey',
    topic: 'Customer satisfaction',
    audience: 'anyone',
    resultVisibility: 'duringAndAfter',
    lifecycle: 'open',
    responseCount: 36,
    questions: [
      {
        order: 1,
        text: 'How often do you use our online services?',
        type: 'single',
        required: true,
        options: [
          { label: 'Daily', value: 'daily', order: 1 },
          { label: 'Weekly', value: 'weekly', order: 2 },
          { label: 'Monthly', value: 'monthly', order: 3 },
          // Skip logic: rare users jump past the usage-specific questions to Q5.
          { label: 'Rarely', value: 'rarely', order: 4, nextQuestionOrder: 5 },
        ],
      },
      {
        order: 2,
        text: 'Overall, how satisfied are you with our services?',
        type: 'single',
        required: true,
        options: [
          { label: 'Very satisfied', value: 'very_satisfied', order: 1 },
          { label: 'Satisfied', value: 'satisfied', order: 2 },
          { label: 'Neutral', value: 'neutral', order: 3 },
          { label: 'Dissatisfied', value: 'dissatisfied', order: 4 },
          { label: 'Very dissatisfied', value: 'very_dissatisfied', order: 5 },
        ],
      },
      {
        order: 3,
        text: 'Which services have you used? (select all that apply)',
        type: 'multi',
        options: [
          { label: 'Notices', value: 'notices', order: 1 },
          { label: 'Civil complaints', value: 'complaints', order: 2 },
          { label: 'Online payments', value: 'payments', order: 3 },
          { label: 'Surveys', value: 'surveys', order: 4 },
          { label: 'Library', value: 'library', order: 5 },
        ],
      },
      {
        order: 4,
        text: 'How did you hear about our online services?',
        type: 'single',
        options: [
          { label: 'The website', value: 'web', order: 1 },
          { label: 'A friend', value: 'friend', order: 2 },
          { label: 'Social media', value: 'social', order: 3 },
          { label: 'Other', value: 'other', order: 4, isOther: true },
        ],
      },
      {
        order: 5,
        text: 'What could we improve?',
        type: 'text',
        includeInPublicResults: true,
      },
      { order: 6, text: 'Any additional comments?', type: 'textarea' },
    ],
  },
  {
    title: '2025 Website Redesign Feedback',
    topic: 'Website usability',
    audience: 'anyone',
    resultVisibility: 'afterClose',
    lifecycle: 'closed',
    responseCount: 31,
    questions: [
      {
        order: 1,
        text: 'How easy was it to find what you were looking for?',
        type: 'single',
        required: true,
        options: [
          { label: 'Very easy', value: 'very_easy', order: 1 },
          { label: 'Easy', value: 'easy', order: 2 },
          { label: 'Difficult', value: 'difficult', order: 3 },
          { label: 'Very difficult', value: 'very_difficult', order: 4 },
        ],
      },
      {
        order: 2,
        text: 'Which device did you use?',
        type: 'single',
        options: [
          { label: 'Desktop', value: 'desktop', order: 1 },
          { label: 'Mobile', value: 'mobile', order: 2 },
          { label: 'Tablet', value: 'tablet', order: 3 },
        ],
      },
      {
        order: 3,
        text: 'Which sections did you visit? (select all that apply)',
        type: 'multi',
        options: [
          { label: 'Home', value: 'home', order: 1 },
          { label: 'Notices', value: 'notices', order: 2 },
          { label: 'Services', value: 'services', order: 3 },
          { label: 'About', value: 'about', order: 4 },
        ],
      },
      {
        order: 4,
        text: 'How would you rate the new design?',
        type: 'single',
        options: [
          { label: 'Excellent', value: 'excellent', order: 1 },
          { label: 'Good', value: 'good', order: 2 },
          { label: 'Fair', value: 'fair', order: 3 },
          { label: 'Poor', value: 'poor', order: 4 },
        ],
      },
      { order: 5, text: 'What did you like most?', type: 'text', includeInPublicResults: true },
      { order: 6, text: 'What should we change?', type: 'textarea' },
    ],
  },
  {
    title: 'Upcoming Community Program Interest',
    topic: 'Community programs',
    audience: 'members',
    resultVisibility: 'afterClose',
    lifecycle: 'scheduled',
    responseCount: 0,
    questions: [
      {
        order: 1,
        text: 'Which upcoming program interests you most?',
        type: 'single',
        required: true,
        options: [
          { label: 'Digital literacy', value: 'digital', order: 1 },
          { label: 'Community gardening', value: 'garden', order: 2 },
          { label: 'Youth mentoring', value: 'mentoring', order: 3 },
          { label: 'Senior wellness', value: 'wellness', order: 4 },
        ],
      },
      {
        order: 2,
        text: 'What times work best for you? (select all that apply)',
        type: 'multi',
        options: [
          { label: 'Weekday mornings', value: 'wd_am', order: 1 },
          { label: 'Weekday evenings', value: 'wd_pm', order: 2 },
          { label: 'Weekends', value: 'weekend', order: 3 },
        ],
      },
      {
        order: 3,
        text: 'Have you participated in a community program before?',
        type: 'single',
        options: [
          { label: 'Yes', value: 'yes', order: 1 },
          { label: 'No', value: 'no', order: 2 },
        ],
      },
      { order: 4, text: 'Which topics would you like to see?', type: 'text' },
      { order: 5, text: 'Any suggestions for the program team?', type: 'textarea' },
    ],
  },
]

/** Builds one response's answers array following the survey's skip logic. */
function buildAnswers(
  questions: {
    id: number
    order: number
    type: string
    options?: { value: string; isOther?: boolean; nextQuestionOrder?: number }[]
  }[],
  i: number,
): Record<string, unknown>[] {
  const byOrder = new Map(questions.map((q) => [q.order, q]))
  const answers: Record<string, unknown>[] = []
  let order = 1
  const maxOrder = Math.max(...questions.map((q) => q.order))
  let guard = 0
  while (order <= maxOrder && guard < 50) {
    guard += 1
    const q = byOrder.get(order)
    if (!q) {
      order += 1
      continue
    }
    if (q.type === 'single') {
      const opts = q.options ?? []
      const chosen = opts[i % Math.max(opts.length, 1)]
      if (chosen) {
        const text = chosen.isOther ? { textValue: 'Referred by a colleague' } : {}
        answers.push({ question: q.id, optionValues: [chosen.value], ...text })
        if (typeof chosen.nextQuestionOrder === 'number') {
          order = chosen.nextQuestionOrder
          continue
        }
      }
    } else if (q.type === 'multi') {
      const opts = q.options ?? []
      // Deterministic subset: pick 1-2 options based on the response index.
      const pick = opts.filter((_, idx) => (idx + i) % 2 === 0).map((o) => o.value)
      answers.push({
        question: q.id,
        optionValues: pick.length > 0 ? pick : opts[0] ? [opts[0].value] : [],
      })
    } else {
      // text / textarea — fill roughly half the time so free-text isn't uniform.
      if (i % 2 === 0) {
        answers.push({
          question: q.id,
          textValue:
            q.type === 'textarea'
              ? 'Thank you for the improvements; the service is much easier to use now.'
              : 'Faster response times would be appreciated.',
        })
      }
    }
    order += 1
  }
  return answers
}

async function seedSurvey(
  payload: Payload,
  tenantId: number,
  seed: SurveySeed,
  memberIds: number[],
): Promise<void> {
  const existing = await payload.find({
    collection: 'surveys',
    where: { and: [{ tenant: { equals: tenantId } }, { title: { equals: seed.title } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    payload.logger.info(`[seed:rich-surveys] "${seed.title}" already exists — skipping.`)
    return
  }

  // 1) Create as a DRAFT (no window) so questions are editable.
  const survey = await payload.create({
    collection: 'surveys',
    data: {
      tenant: tenantId,
      title: seed.title,
      description: lexical(
        'Your feedback helps us improve public services. This takes about a minute.',
      ),
      topic: seed.topic,
      audience: seed.audience,
      resultVisibility: seed.resultVisibility,
      anonymous: false,
      isActive: true,
    } as never,
    overrideAccess: true,
  })

  // 2) Add questions while the survey is not yet started.
  const createdQuestions: {
    id: number
    order: number
    type: string
    options?: { value: string; isOther?: boolean; nextQuestionOrder?: number }[]
  }[] = []
  for (const q of seed.questions) {
    const created = await payload.create({
      collection: 'surveyQuestions',
      data: {
        survey: survey.id,
        order: q.order,
        text: q.text,
        type: q.type,
        required: q.required ?? false,
        ...(q.includeInPublicResults ? { includeInPublicResults: true } : {}),
        ...(q.options ? { options: q.options } : {}),
      } as never,
      overrideAccess: true,
    })
    createdQuestions.push({ id: created.id, order: q.order, type: q.type, options: q.options })
  }

  // 3) Move the survey into its lifecycle window (open / closed / scheduled).
  const now = Date.now()
  const DAY = 86_400_000
  const windowData =
    seed.lifecycle === 'open'
      ? {
          openFrom: new Date(now - 20 * DAY).toISOString(),
          openTo: new Date(now + 20 * DAY).toISOString(),
        }
      : seed.lifecycle === 'closed'
        ? {
            openFrom: new Date(now - 120 * DAY).toISOString(),
            openTo: new Date(now - 60 * DAY).toISOString(),
          }
        : {
            openFrom: new Date(now + 14 * DAY).toISOString(),
            openTo: new Date(now + 44 * DAY).toISOString(),
          }
  await payload.update({
    collection: 'surveys',
    id: survey.id,
    data: windowData as never,
    overrideAccess: true,
  })

  // 4) Responses (mix of anonymous + member-attributed). A scheduled survey gets
  //    none (it hasn't opened — leaving its questions editable, ref 2-12).
  for (let i = 0; i < seed.responseCount; i++) {
    const answers = buildAnswers(createdQuestions, i)
    // Every ~4th response is tied to a distinct seeded member (unique per survey);
    // the rest are anonymous (respondent null). Cap member-tied to available ids.
    const memberIdx = Math.floor(i / 4)
    const respondent = i % 4 === 0 && memberIdx < memberIds.length ? memberIds[memberIdx] : null
    const submittedOffset =
      seed.lifecycle === 'closed' ? 90 - Math.floor(i * 1.5) : 18 - Math.floor(i * 0.4)
    await payload.create({
      collection: 'surveyResponses',
      data: {
        survey: survey.id,
        respondent,
        submittedAt: daysAgoISO(submittedOffset > 0 ? submittedOffset : 1, 12),
        tenant: tenantId,
        answers,
      } as never,
      overrideAccess: true,
    })
  }

  payload.logger.info(
    `[seed:rich-surveys] created "${seed.title}" (${seed.lifecycle}) with ${seed.questions.length} questions + ${seed.responseCount} responses.`,
  )
}

/**
 * Three demo surveys — one OPEN, one CLOSED, one SCHEDULED — each with 5-6
 * questions across all four legacy types (single with an "Other" + a skip
 * branch, multi, short text, long text) and 30-60 responses (anonymous +
 * member-attributed) so results/charts/exports are populated (owner mandate;
 * refs 2-9..2-12). Immutability-safe: questions are built while the survey is
 * a draft, then the window is applied. Idempotent by (tenant, title).
 */
export const richSurveysStep: SeedStep = {
  name: 'rich-surveys',
  async run(payload: Payload) {
    const tenantId = await siteIdBySiteId(payload, 'demo')

    // A handful of seeded members to attribute some responses to.
    const members = await payload.find({
      collection: 'members',
      where: { and: [{ tenant: { equals: tenantId } }, { status: { equals: 'active' } }] },
      limit: 12,
      pagination: false,
      overrideAccess: true,
      depth: 0,
    })
    const memberIds = members.docs.map((m) => m.id as number)

    for (const seed of SURVEY_SEEDS) {
      await seedSurvey(payload, tenantId, seed, memberIds)
    }
  },
}
