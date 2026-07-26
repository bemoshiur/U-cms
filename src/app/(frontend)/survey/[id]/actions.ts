'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { resolveClientIp } from '@/security/adminIpEnforcement'
import { checkPublicRateLimit } from '@/security/rateLimit'
import type { SubmittedAnswer } from '@/content/survey'
import { getCurrentMember } from '@/site/member'
import { getPayloadClient } from '@/site/rsc'
import { SurveyError, submitSurveyResponse } from '@/site/survey'

/**
 * Survey response server action (Task 4D Part 4). Parses the answers from the
 * form (field names encode the question type + order — decoupled from the DB),
 * resolves the member session + a trustworthy client IP, rate-limits, and
 * delegates to the security-hardened {@link submitSurveyResponse} (which
 * server-forces survey/respondent/submittedAt/tenant and validates open-window +
 * audience + answers + one-response + profanity). Errors are passed back via the
 * query string (React escapes them on render).
 *
 * ## Field-name encoding (client-side, no DB lookup needed here)
 *  - `single_<order>`  → one selected option value (radio)
 *  - `multi_<order>`   → many selected option values (checkboxes)
 *  - `text_<order>`    → free text for a text/textarea question
 *  - `other_<order>`   → the "other" free text for a choice question
 * A question is either a choice OR a text question, so `text_`/`other_` never
 * collide — both map to the answer's single `textValue`.
 */

function parseAnswers(formData: FormData): Map<number, SubmittedAnswer> {
  const orders = new Set<number>()
  for (const key of formData.keys()) {
    const m = key.match(/^(?:single|multi|text|other)_(\d+)$/)
    if (m) {
      orders.add(Number(m[1]))
    }
  }
  const submitted = new Map<number, SubmittedAnswer>()
  for (const order of orders) {
    const optionValues: string[] = []
    const single = formData.get(`single_${order}`)
    if (typeof single === 'string' && single.length > 0) {
      optionValues.push(single)
    }
    for (const v of formData.getAll(`multi_${order}`)) {
      if (typeof v === 'string' && v.length > 0) {
        optionValues.push(v)
      }
    }
    const text = formData.get(`text_${order}`)
    const other = formData.get(`other_${order}`)
    const textValue =
      typeof text === 'string' && text.length > 0
        ? text
        : typeof other === 'string' && other.length > 0
          ? other
          : undefined
    submitted.set(order, {
      optionValues: optionValues.length > 0 ? optionValues : undefined,
      textValue,
    })
  }
  return submitted
}

export async function submitSurveyAction(formData: FormData): Promise<void> {
  const surveyId = String(formData.get('surveyId') ?? '')
  const path = `/survey/${encodeURIComponent(surveyId)}`
  if (!Number.isInteger(Number(surveyId))) {
    redirect(`${path}?error=` + encodeURIComponent('This survey is not available.'))
  }

  const requestHeaders = await headers()
  const rl = checkPublicRateLimit({ headers: requestHeaders }, 'survey-respond')
  if (!rl.allowed) {
    redirect(`${path}?error=` + encodeURIComponent('Too many requests. Please wait a while.'))
  }

  const member = await getCurrentMember()
  const client = resolveClientIp(requestHeaders)
  const clientIp = client.trusted ? client.ip : null
  const submittedByOrder = parseAnswers(formData)

  const payload = await getPayloadClient()
  let errorMessage: string | undefined
  try {
    await submitSurveyResponse(payload, { surveyId, submittedByOrder }, { member, clientIp })
  } catch (e) {
    errorMessage =
      e instanceof SurveyError
        ? e.message
        : 'Your response could not be submitted. Please try again.'
  }
  if (errorMessage) {
    redirect(`${path}?error=` + encodeURIComponent(errorMessage))
  }
  redirect(`${path}?submitted=1`)
}
