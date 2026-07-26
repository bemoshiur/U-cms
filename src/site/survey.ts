import type { Payload } from 'payload'
import { APIError } from 'payload'

import { toRelationId } from '../collections/utils'
import { containsProfanity } from '../content/wordFilter'
import {
  computeParticipantKey,
  isSurveyOpen,
  surveyStatus,
  validateSurveyAnswers,
  type SubmittedAnswer,
  type SurveyQuestionLike,
} from '../content/survey'
import type { CurrentMember } from './member'

/**
 * Public-site SURVEY run + submit seam (Task 4D; refs 2-11, 2-12). The
 * security-critical counterpart to `src/members/ask.ts`: the response record is
 * built ENTIRELY server-side from an allow-list (the answers), and every
 * trust-sensitive field is force-set from server state:
 *
 *  - `survey`/`tenant` — from the resolved survey (never the client).
 *  - `respondent` — from the member session, or NULL for an anonymous survey /
 *    an anonymous submitter (never a client-supplied member id).
 *  - `submittedAt` — the server clock.
 *  - `participantKey` — a hashed, identity-free dedup key.
 *
 * Server-side validation additionally enforces: the survey is OPEN (window +
 * audience), one-response-per-participant, the pure answer rules
 * (`validateSurveyAnswers` — required/cardinality/option-membership/other-text,
 * accepting any valid skip path), and the profanity gate on free text. The
 * create runs with `overrideAccess: true` (a system write, like signup/ask) so
 * the server-forced fields' write locks are bypassed only here.
 */

/** Thrown for a client-correctable submit problem; carries an HTTP status. */
export class SurveyError extends APIError {}

/**
 * The server secret keying the participant-key HMAC (review C3). A dedicated
 * `SURVEY_PARTICIPANT_SECRET` if set, else `PAYLOAD_SECRET` (always present).
 * Never exposed; the key is only ever compared server-side.
 */
function participantSecret(): string {
  return process.env.SURVEY_PARTICIPANT_SECRET || process.env.PAYLOAD_SECRET || ''
}

/** True iff an error is a Postgres unique-constraint violation (23505), however wrapped. */
function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>()
  let cur: unknown = err
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur)
    const e = cur as { code?: unknown; message?: unknown; cause?: unknown }
    if (e.code === '23505') {
      return true
    }
    if (typeof e.message === 'string' && /duplicate key value|unique constraint/i.test(e.message)) {
      return true
    }
    cur = e.cause
  }
  return false
}

/** Generic profanity rejection (never echoes the matched word). */
const PROFANITY_MESSAGE =
  'Your answer contains words that are not allowed. Please revise and resubmit.'

async function loadSurvey(payload: Payload, surveyId: string | number) {
  return payload.findByID({
    collection: 'surveys',
    id: surveyId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
}

/** Loads a survey on the active site (tenant) by id, or null (cross-site → null). */
export async function loadSurveyForSite(
  payload: Payload,
  tenantId: string | number,
  surveyId: string | number,
): Promise<Awaited<ReturnType<typeof loadSurvey>> | null> {
  if (!Number.isInteger(Number(surveyId))) {
    return null
  }
  const survey = await loadSurvey(payload, surveyId)
  if (!survey || String(toRelationId(survey.tenant)) !== String(tenantId)) {
    return null
  }
  return survey
}

export type OpenSurveyListItem = { id: string | number; title: string; topic?: string | null }

/**
 * Currently-OPEN surveys on a site, for the public `/survey` index. Fetches the
 * tenant's surveys and filters to `open` with the pure `surveyStatus` helper (the
 * time window can't be expressed cleanly in one query). Trusted read surface.
 */
export async function loadOpenSurveysForSite(
  payload: Payload,
  tenantId: string | number,
): Promise<OpenSurveyListItem[]> {
  const found = await payload.find({
    collection: 'surveys',
    where: { and: [{ tenant: { equals: tenantId } }, { isActive: { equals: true } }] },
    depth: 0,
    limit: 0,
    pagination: false,
    sort: '-createdAt',
    overrideAccess: true,
  })
  return found.docs
    .filter((s) => surveyStatus(s) === 'open')
    .map((s) => ({ id: s.id, title: s.title, topic: s.topic ?? null }))
}

/** All questions of a survey, ordered — for the run form + aggregation. */
export async function loadSurveyQuestions(
  payload: Payload,
  surveyId: string | number,
): Promise<SurveyQuestionLike[]> {
  const found = await payload.find({
    collection: 'surveyQuestions',
    where: { survey: { equals: surveyId } },
    sort: 'order',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs as unknown as SurveyQuestionLike[]
}

/** Every response to a survey (for aggregation/results). Trusted read surface. */
export async function loadSurveyResponses(payload: Payload, surveyId: string | number) {
  const found = await payload.find({
    collection: 'surveyResponses',
    where: { survey: { equals: surveyId } },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs
}

/** Whether a given member has already responded to a survey (non-anonymous path). */
export async function memberHasResponded(
  payload: Payload,
  surveyId: string | number,
  memberId: string | number,
): Promise<boolean> {
  const found = await payload.find({
    collection: 'surveyResponses',
    where: { and: [{ survey: { equals: surveyId } }, { respondent: { equals: memberId } }] },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.length > 0
}

async function participantKeyExists(
  payload: Payload,
  surveyId: string | number,
  key: string,
): Promise<boolean> {
  const found = await payload.find({
    collection: 'surveyResponses',
    where: { and: [{ survey: { equals: surveyId } }, { participantKey: { equals: key } }] },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  return found.docs.length > 0
}

export type SurveySubmitContext = {
  member: CurrentMember
  /** A trustworthy client IP (already resolved through the trusted-proxy model), or null. */
  clientIp?: string | null
}

/**
 * Records one survey response. Throws {@link SurveyError} for any
 * client-correctable problem (closed, wrong audience, duplicate, invalid
 * answers, profanity). Returns the new response id.
 */
export async function submitSurveyResponse(
  payload: Payload,
  input: { surveyId: string | number; submittedByOrder: Map<number, SubmittedAnswer> },
  context: SurveySubmitContext,
): Promise<{ id: string | number }> {
  const { member, clientIp } = context
  const survey = await loadSurvey(payload, input.surveyId)
  if (!survey) {
    throw new SurveyError('This survey is not available.', 404)
  }

  // ── window ────────────────────────────────────────────────────────────────
  if (!isSurveyOpen(survey)) {
    throw new SurveyError('This survey is not currently open.', 403)
  }

  const surveyTenantId = toRelationId(survey.tenant)
  const memberOnSurveySite =
    member != null &&
    surveyTenantId !== undefined &&
    String(toRelationId(member.tenant)) === String(surveyTenantId)

  // ── audience ────────────────────────────────────────────────────────────────
  if (survey.audience === 'members' && !memberOnSurveySite) {
    throw new SurveyError('You must be signed in on this site to respond to this survey.', 401)
  }

  // ── respondent + dedup key (identity-free) ──────────────────────────────────
  const anonymous = survey.anonymous === true
  const respondent =
    anonymous || !memberOnSurveySite ? null : (member as NonNullable<CurrentMember>).id
  const participantKey = computeParticipantKey(
    survey.id,
    {
      memberId: memberOnSurveySite ? (member as NonNullable<CurrentMember>).id : null,
      clientIp: clientIp ?? null,
    },
    participantSecret(),
  )

  // ── one-response-per-participant ────────────────────────────────────────────
  if (respondent != null) {
    if (await memberHasResponded(payload, survey.id, respondent)) {
      throw new SurveyError('You have already responded to this survey.', 409)
    }
  } else if (participantKey != null) {
    if (await participantKeyExists(payload, survey.id, participantKey)) {
      throw new SurveyError('You have already responded to this survey.', 409)
    }
  }
  // respondent null AND participantKey null → best-effort only (no trustworthy
  // key); documented conservative behavior (no enforcement).

  // ── validate answers (pure rules + skip logic) ──────────────────────────────
  const questions = await loadSurveyQuestions(payload, survey.id)
  const validated = validateSurveyAnswers(questions, input.submittedByOrder)
  if (validated.errorMessage) {
    throw new SurveyError(validated.errorMessage, 400)
  }

  // ── profanity gate on free text (never echoes the word) ─────────────────────
  if (validated.freeTexts.length > 0) {
    const active = await payload.find({
      collection: 'profanityWords',
      where: { isActive: { equals: true } },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    if (active.docs.length > 0 && containsProfanity(validated.freeTexts.join(' '), active.docs)) {
      throw new SurveyError(PROFANITY_MESSAGE, 400)
    }
  }

  // ── persist (server-forced fields) ──────────────────────────────────────────
  try {
    const created = await payload.create({
      collection: 'surveyResponses',
      data: {
        survey: survey.id,
        respondent,
        submittedAt: new Date().toISOString(),
        participantKey,
        ...(surveyTenantId !== undefined ? { tenant: surveyTenantId } : {}),
        answers: validated.answers.map((a) => ({
          question: a.questionId,
          optionValues: a.optionValues,
          ...(a.textValue ? { textValue: a.textValue } : {}),
        })),
      } as never,
      overrideAccess: true,
    })
    return { id: created.id }
  } catch (err) {
    // Unique-constraint backstop for the dedup TOCTOU (review H4): a concurrent
    // submit that won the (survey, respondent)/(survey, participantKey) race
    // makes this create violate the unique index — surface the friendly
    // already-responded instead of a raw 500. Re-confirm a duplicate now exists
    // (belt and braces) before mapping so a genuine failure still propagates.
    const nowDuplicate =
      respondent != null
        ? await memberHasResponded(payload, survey.id, respondent)
        : participantKey != null
          ? await participantKeyExists(payload, survey.id, participantKey)
          : false
    if (nowDuplicate || isUniqueViolation(err)) {
      throw new SurveyError('You have already responded to this survey.', 409)
    }
    throw err
  }
}
