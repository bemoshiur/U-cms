import { createHmac } from 'crypto'

import { toRelationId } from '../collections/utils'

/**
 * Survey domain helpers (Task 4D; feature-inventory refs 2-9..2-12). PURE and
 * node-only — no Payload/DB/Next imports — so every rule here is exhaustively
 * unit-testable (see tests/unit/survey.spec.ts) and reused verbatim by the
 * collection hooks (`src/collections/surveys/*`), the hardened public submit
 * (`src/site/survey.ts`), the results page, and the CSV exports
 * (`src/endpoints/surveyExport.ts`). Keeping the logic in one pure place is what
 * lets "the server-side validation must still accept a valid skip path" and
 * "results visibility per resultVisibility" be the SAME code the tests assert.
 */

/** The four legacy question types (ref 2-10). */
export const SURVEY_QUESTION_TYPES = ['single', 'multi', 'text', 'textarea'] as const
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number]

/** Derived lifecycle state (ref 2-9) — never stored, always computed from the window + toggle. */
export type SurveyStatus = 'scheduled' | 'open' | 'closed'

/** When aggregate results may be viewed (ref 2-12). */
export const SURVEY_RESULT_VISIBILITIES = ['afterClose', 'duringAndAfter', 'adminsOnly'] as const
export type SurveyResultVisibility = (typeof SURVEY_RESULT_VISIBILITIES)[number]

/** Who may respond (ref 2-9). */
export const SURVEY_AUDIENCES = ['anyone', 'members'] as const
export type SurveyAudience = (typeof SURVEY_AUDIENCES)[number]

/** The subset of a survey the pure helpers read. */
export type SurveyLike = {
  isActive?: boolean | null
  openFrom?: string | Date | null
  openTo?: string | Date | null
  hasResponses?: boolean | null
  /** STICKY start latch — set once the window opens or the first response lands, never un-set. */
  startedAt?: string | Date | null
  anonymous?: boolean | null
  audience?: SurveyAudience | string | null
  resultVisibility?: SurveyResultVisibility | string | null
}

export type SurveyOptionLike = {
  label?: string | null
  value?: string | null
  order?: number | null
  isOther?: boolean | null
  nextQuestionOrder?: number | null
}

export type SurveyQuestionLike = {
  id?: string | number
  order?: number | null
  text?: string | null
  type?: SurveyQuestionType | string | null
  required?: boolean | null
  options?: SurveyOptionLike[] | null
}

export type SubmittedAnswer = {
  optionValues?: string[]
  textValue?: string
}

/** A stored/normalized answer (matches the `surveyResponses.answers` row shape). */
export type NormalizedAnswer = {
  questionId: string | number
  optionValues: string[]
  textValue?: string
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value
  }
  if (typeof value === 'string' && value.length > 0) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? undefined : d
  }
  return undefined
}

/**
 * Derives a survey's lifecycle status (ref 2-9). An inactive survey is always
 * `closed`; an active one is `scheduled` before its `openFrom`, `closed` after
 * its `openTo`, and `open` within (or when the bound is unset). Never persisted
 * — the window makes any stored status go stale, so it is computed on demand.
 */
export function surveyStatus(survey: SurveyLike, now: Date = new Date()): SurveyStatus {
  if (survey.isActive === false) {
    return 'closed'
  }
  const from = toDate(survey.openFrom)
  const to = toDate(survey.openTo)
  if (from && now.getTime() < from.getTime()) {
    return 'scheduled'
  }
  if (to && now.getTime() > to.getTime()) {
    return 'closed'
  }
  return 'open'
}

/** True iff the survey is currently accepting responses. */
export function isSurveyOpen(survey: SurveyLike, now: Date = new Date()): boolean {
  return surveyStatus(survey, now) === 'open'
}

/**
 * True once a survey is STARTED — the trigger that freezes its questions/options
 * (ref 2-12). Started once ANY of:
 *  - the STICKY `startedAt` latch is set (persisted the first time the window
 *    opened or a response arrived, and NEVER un-set — see `Surveys.ts`
 *    `latchStartedAt`). This is what makes the freeze irreversible: an admin
 *    cannot un-freeze by pushing `openFrom` back into the future (security
 *    review C2), because the latch was already stamped on the previous save.
 *  - `hasResponses` (a response exists), or
 *  - the live window check (`now >= openFrom`) — covers the gap between the
 *    window opening by the clock and the next survey save/response that latches.
 * `isActive` deliberately does NOT gate this: an admin must never be able to
 * un-freeze by toggling the survey inactive.
 */
export function isSurveyStarted(survey: SurveyLike, now: Date = new Date()): boolean {
  if (survey.startedAt) {
    return true
  }
  if (survey.hasResponses === true) {
    return true
  }
  const from = toDate(survey.openFrom)
  return Boolean(from && now.getTime() >= from.getTime())
}

/**
 * Whether a survey's window is (already) OPEN as of `now` — used by the sticky
 * latch to decide, at save time, if the CURRENTLY-persisted window has opened.
 * Distinct from `isSurveyStarted`: this looks only at `openFrom` (ignores the
 * latch/responses), so the latch reads the pre-change state and stamps once.
 */
export function windowHasOpened(
  openFrom: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const from = toDate(openFrom)
  return Boolean(from && now.getTime() >= from.getTime())
}

/**
 * Whether aggregate results are viewable for a given viewer (ref 2-12).
 * Admins always see results. Public visibility follows `resultVisibility`:
 * `adminsOnly` never; `afterClose` only once the survey is closed;
 * `duringAndAfter` while open OR after close ("results visible from in-progress").
 * A `scheduled` (not-yet-open) survey never shows public results.
 */
export function resultsVisible(
  survey: SurveyLike,
  viewer: 'admin' | 'public',
  now: Date = new Date(),
): boolean {
  if (viewer === 'admin') {
    return true
  }
  const visibility = survey.resultVisibility ?? 'afterClose'
  if (visibility === 'adminsOnly') {
    return false
  }
  const status = surveyStatus(survey, now)
  if (visibility === 'duringAndAfter') {
    return status === 'open' || status === 'closed'
  }
  // afterClose
  return status === 'closed'
}

function sortedByOrder(questions: SurveyQuestionLike[]): SurveyQuestionLike[] {
  return [...questions]
    .filter((q) => typeof q.order === 'number')
    .sort((a, b) => (a.order as number) - (b.order as number))
}

/**
 * Resolves which question ORDERS are reachable given the respondent's
 * single-choice selections, implementing per-option skip logic (ref 2-11).
 *
 * Traversal starts at the lowest-order question and walks forward: a `single`
 * question whose selected option carries a `nextQuestionOrder` JUMPS to that
 * order (skipping everything between); otherwise flow falls through to the next
 * question in order. A jump target that matches no question, or that has already
 * been visited (a backward/cyclic pointer), ends the walk. Only reachable
 * questions have their `required` enforced — so a valid skip path is always
 * accepted server-side.
 */
export function reachableQuestionOrders(
  questions: SurveyQuestionLike[],
  selectedByOrder: Map<number, string[]>,
): Set<number> {
  const sorted = sortedByOrder(questions)
  const byOrder = new Map<number, SurveyQuestionLike>()
  for (const q of sorted) {
    byOrder.set(q.order as number, q)
  }
  const reachable = new Set<number>()
  let current: number | undefined = sorted[0]?.order ?? undefined
  while (current !== undefined && byOrder.has(current) && !reachable.has(current)) {
    reachable.add(current)
    const q = byOrder.get(current) as SurveyQuestionLike
    let next: number | undefined
    if (q.type === 'single') {
      const selected = selectedByOrder.get(current) ?? []
      const opt = (q.options ?? []).find(
        (o) => o?.value != null && selected.includes(String(o.value)),
      )
      if (opt && typeof opt.nextQuestionOrder === 'number') {
        next = opt.nextQuestionOrder
      }
    }
    if (next === undefined) {
      const idx = sorted.findIndex((s) => s.order === current)
      next = sorted[idx + 1]?.order ?? undefined
    }
    current = next
  }
  return reachable
}

export type ValidationResult = {
  /** A client-correctable error, or undefined when the submission is valid. */
  errorMessage?: string
  /** Normalized answers to persist (reachable, non-empty). */
  answers: NormalizedAnswer[]
  /** Every free-text string in the submission (fed to the profanity gate). */
  freeTexts: string[]
}

/**
 * Validates a raw submission against the survey's questions (ref 2-12), PURE of
 * any DB. Enforces, for every REACHABLE question (skip logic honored):
 *  - option values ∈ the question's own options,
 *  - single-choice cardinality (at most one; exactly one when required),
 *  - multi-choice required → at least one,
 *  - text/textarea required → non-empty,
 *  - an "other" option selected → its free text present.
 *
 * Returns the normalized answers to persist plus every free-text value (for the
 * caller's profanity gate). The profanity/word check is intentionally NOT here
 * (it needs the DB word list); this stays a pure, exhaustively testable core.
 */
export function validateSurveyAnswers(
  questions: SurveyQuestionLike[],
  submittedByOrder: Map<number, SubmittedAnswer>,
): ValidationResult {
  const answers: NormalizedAnswer[] = []
  const freeTexts: string[] = []

  // Selections drive skip resolution — build the order→values map first.
  const selectedByOrder = new Map<number, string[]>()
  for (const q of questions) {
    if (typeof q.order !== 'number') {
      continue
    }
    if (q.type === 'single' || q.type === 'multi') {
      selectedByOrder.set(q.order, submittedByOrder.get(q.order)?.optionValues ?? [])
    }
  }
  const reachable = reachableQuestionOrders(questions, selectedByOrder)

  for (const q of sortedByOrder(questions)) {
    const order = q.order as number
    const reachableHere = reachable.has(order)
    const sub = submittedByOrder.get(order)
    const qid = q.id
    const label = q.text || `Question ${order}`

    if (q.type === 'single' || q.type === 'multi') {
      const validValues = new Set((q.options ?? []).map((o) => String(o?.value)))
      const values = (sub?.optionValues ?? []).map((v) => String(v)).filter((v) => v.length > 0)

      for (const v of values) {
        if (!validValues.has(v)) {
          return { errorMessage: `Invalid option for "${label}".`, answers, freeTexts }
        }
      }
      if (q.type === 'single' && values.length > 1) {
        return { errorMessage: `Select only one option for "${label}".`, answers, freeTexts }
      }
      if (reachableHere && q.required === true && values.length < 1) {
        return { errorMessage: `"${label}" is required.`, answers, freeTexts }
      }

      // "Other" free text — required when an isOther option is selected.
      let otherText: string | undefined
      const otherSelected = (q.options ?? []).some(
        (o) => o?.isOther === true && o?.value != null && values.includes(String(o.value)),
      )
      if (otherSelected) {
        otherText = (sub?.textValue ?? '').trim()
        if (otherText.length === 0) {
          return {
            errorMessage: `Please fill in the "other" answer for "${label}".`,
            answers,
            freeTexts,
          }
        }
        freeTexts.push(otherText)
      }

      if (qid !== undefined && (values.length > 0 || otherText)) {
        answers.push({
          questionId: qid,
          optionValues: values,
          ...(otherText ? { textValue: otherText } : {}),
        })
      }
    } else {
      // text / textarea
      const text = (sub?.textValue ?? '').trim()
      if (reachableHere && q.required === true && text.length === 0) {
        return { errorMessage: `"${label}" is required.`, answers, freeTexts }
      }
      if (text.length > 0) {
        freeTexts.push(text)
        if (qid !== undefined) {
          answers.push({ questionId: qid, optionValues: [], textValue: text })
        }
      }
    }
  }

  return { answers, freeTexts }
}

/** Per-option tally for an aggregated single/multi question. */
export type OptionAggregate = {
  value: string
  label: string
  isOther: boolean
  count: number
  /** Percentage of respondents who ANSWERED this question (0 when none did). */
  percentage: number
}

export type QuestionAggregate = {
  questionId: string | number | undefined
  order: number | null
  text: string
  type: SurveyQuestionType | string
  answeredCount: number
  options: OptionAggregate[]
  otherTexts: string[]
  textAnswers: string[]
}

export type SurveyAggregate = {
  totalResponses: number
  questions: QuestionAggregate[]
}

export type ResponseLike = {
  answers?:
    | {
        question?: unknown
        optionValues?: string[] | null
        textValue?: string | null
      }[]
    | null
}

/**
 * Aggregates responses per question (ref 2-12) — the single source of truth for
 * BOTH the results page and the summary CSV export. For single/multi questions
 * it returns per-option counts + percentages (of respondents who answered that
 * question) and any "other" free texts; for text/textarea it returns the list
 * of text answers. PURE + unit-tested.
 */
export function aggregateSurvey(
  questions: SurveyQuestionLike[],
  responses: ResponseLike[],
): SurveyAggregate {
  const sorted = sortedByOrder(questions)

  const perQuestion: QuestionAggregate[] = sorted.map((q) => {
    const options = (q.options ?? []).map((o) => ({
      value: String(o?.value ?? ''),
      label: o?.label || String(o?.value ?? ''),
      isOther: o?.isOther === true,
      count: 0,
      percentage: 0,
    }))
    return {
      questionId: q.id,
      order: q.order ?? null,
      text: q.text || '',
      type: (q.type as SurveyQuestionType) || 'text',
      answeredCount: 0,
      options,
      otherTexts: [] as string[],
      textAnswers: [] as string[],
    }
  })

  const byQuestionId = new Map<string, QuestionAggregate>()
  for (const agg of perQuestion) {
    if (agg.questionId !== undefined) {
      byQuestionId.set(String(agg.questionId), agg)
    }
  }

  for (const response of responses) {
    for (const answer of response.answers ?? []) {
      const qid = toRelationId(answer?.question)
      if (qid === undefined) {
        continue
      }
      const agg = byQuestionId.get(String(qid))
      if (!agg) {
        continue
      }
      const values = Array.isArray(answer?.optionValues) ? answer.optionValues : []
      const text = typeof answer?.textValue === 'string' ? answer.textValue.trim() : ''
      const answered = values.length > 0 || text.length > 0
      if (answered) {
        agg.answeredCount += 1
      }
      if (agg.type === 'single' || agg.type === 'multi') {
        for (const opt of agg.options) {
          if (values.includes(opt.value)) {
            opt.count += 1
          }
        }
        if (text.length > 0) {
          agg.otherTexts.push(text)
        }
      } else if (text.length > 0) {
        agg.textAnswers.push(text)
      }
    }
  }

  // Percentages once counts are final (denominator = respondents who answered).
  for (const agg of perQuestion) {
    if (agg.answeredCount > 0) {
      for (const opt of agg.options) {
        opt.percentage = Math.round((opt.count / agg.answeredCount) * 1000) / 10
      }
    }
  }

  return { totalResponses: responses.length, questions: perQuestion }
}

/**
 * Deterministic, identity-free participant key for one-response-per-participant
 * enforcement (ref 2-12). Derived from a member id when the respondent is logged
 * in (so even an ANONYMOUS survey can dedupe one-per-member WITHOUT storing who
 * answered), else from a trustworthy client IP. Returns `null` when neither is
 * available — the caller then treats dedup as best-effort (no key, no
 * enforcement), the documented conservative choice.
 *
 * SECURITY (review C3): the key is an **HMAC keyed with a SERVER SECRET**, not a
 * bare hash, so it CANNOT be recomputed off-server. A bare `sha256(surveyId:
 * memberId)` would let an admin — the very party anonymity protects against —
 * recompute the digest for any candidate member id and de-anonymize a response.
 * With the HMAC, deriving the key requires the secret (never exposed), and the
 * `participantKey` column is additionally field-level `read:false`, so it never
 * leaves the server. The survey id is mixed into the message so a key never
 * collides across surveys, and two different secrets yield different keys.
 */
export function computeParticipantKey(
  surveyId: string | number,
  principal: { memberId?: string | number | null; clientIp?: string | null },
  serverSecret: string,
): string | null {
  let base: string
  if (principal.memberId !== undefined && principal.memberId !== null) {
    base = `m:${principal.memberId}`
  } else if (principal.clientIp) {
    base = `ip:${principal.clientIp}`
  } else {
    return null
  }
  return createHmac('sha256', serverSecret).update(`${surveyId}:${base}`).digest('hex')
}
