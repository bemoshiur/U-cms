import { notFound } from 'next/navigation'
import React from 'react'

import { aggregateSurvey, resultsVisible, surveyStatus } from '@/content/survey'
import { getCurrentMember } from '@/site/member'
import { getActiveSite, getPayloadClient } from '@/site/rsc'
import {
  loadSurveyForSite,
  loadSurveyQuestions,
  loadSurveyResponses,
  memberHasResponded,
} from '@/site/survey'
import { toRelationId } from '@/collections/utils'
import { RichTextContent } from '../../_components/RichTextContent'
import { SurveyForm } from '../../_components/survey/SurveyForm'
import { SurveyResults } from '../../_components/survey/SurveyResults'

type RawSearch = Record<string, string | string[] | undefined>

function first(raw: RawSearch, key: string): string | undefined {
  const v = raw[key]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.length > 0 ? s : undefined
}

/**
 * Public survey run + results route (`/survey/[id]`, Task 4D Part 4; refs
 * 2-11, 2-12). Resolves the survey on the ACTIVE site (404 on unknown /
 * cross-site). Renders, per state:
 *  - members-only survey + no matching login → a sign-in prompt,
 *  - open + not-yet-responded → the {@link SurveyForm},
 *  - scheduled / closed / already-responded → a status message,
 *  - results (per `survey.resultVisibility`) below, when visible to the public.
 */
export default async function SurveyRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<RawSearch>
}) {
  const { id } = await params
  const raw = await searchParams

  const [site, member] = await Promise.all([getActiveSite(), getCurrentMember()])
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const survey = await loadSurveyForSite(payload, site.id, id)
  if (!survey) {
    notFound()
  }

  const status = surveyStatus(survey)
  const questions = await loadSurveyQuestions(payload, survey.id)
  const memberOnSite = member != null && String(toRelationId(member.tenant)) === String(site.id)
  const audienceMembers = survey.audience === 'members'
  const loginRequired = audienceMembers && !memberOnSite

  const alreadyResponded =
    memberOnSite && survey.anonymous !== true
      ? await memberHasResponded(payload, survey.id, (member as { id: string | number }).id)
      : false

  const showResults = resultsVisible(survey, 'public')
  const results = showResults
    ? // D3 (Task 5B): PUBLIC audience — verbatim free-text is hidden unless the
      // question opted in via `includeInPublicResults` (default OFF).
      aggregateSurvey(questions, await loadSurveyResponses(payload, survey.id), {
        audience: 'public',
      })
    : null

  const submitted = first(raw, 'submitted') === '1'
  const error = first(raw, 'error')
  const backPath = `/survey/${encodeURIComponent(id)}`

  return (
    <div className="page page--survey">
      <h1 className="page__title">{survey.title}</h1>
      {survey.description ? (
        <div className="survey-description">
          <RichTextContent data={survey.description} />
        </div>
      ) : null}
      {survey.topic || survey.contactPhone ? (
        <p className="survey-meta">
          {survey.topic ? <span>Topic: {survey.topic}</span> : null}
          {survey.contactPhone ? <span> · Contact: {survey.contactPhone}</span> : null}
        </p>
      ) : null}

      {loginRequired ? (
        <p className="survey-notice">
          This survey is for members only.{' '}
          <a href={`/login?next=${encodeURIComponent(backPath)}`}>Sign in</a> to respond.
        </p>
      ) : submitted ? (
        <p className="survey-notice survey-notice--thanks" role="status">
          Thank you — your response has been recorded.
        </p>
      ) : alreadyResponded ? (
        <p className="survey-notice">You have already responded to this survey. Thank you.</p>
      ) : status === 'scheduled' ? (
        <p className="survey-notice">This survey is not open yet. Please check back later.</p>
      ) : status === 'closed' ? (
        <p className="survey-notice">This survey is closed.</p>
      ) : (
        <SurveyForm surveyId={survey.id} questions={questions} error={error} />
      )}

      {results ? <SurveyResults aggregate={results} /> : null}
    </div>
  )
}
