import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { aggregateSurvey } from '../content/survey'
import { loadSurveyQuestions, loadSurveyResponses } from '../site/survey'
import { findAccessibleDoc, notFoundResponse } from '../security/existenceOracle'

/**
 * Survey admin RESULTS view (Audit Fix 5; ref 2-12). ONE access-gated,
 * tenant-scoped collection endpoint on `surveys`, mirroring `surveyExport.ts`
 * exactly (same existence-oracle gate, same 404-collapse posture) but
 * returning JSON instead of a CSV download — this is what the
 * `beforeDocumentControls` "View results" panel on the survey edit screen
 * fetches:
 *
 *   GET /api/surveys/:id/results → { ok, survey: { id, title }, aggregate }
 *
 * `resultsVisible(survey, 'admin')` is UNCONDITIONALLY true (see
 * `src/content/survey.ts`) — an admin who can READ the survey at all (the
 * collection's own tenant-scoped `access.read`, via {@link findAccessibleDoc})
 * always sees its results, regardless of the survey's public
 * `resultVisibility` setting. `aggregateSurvey` runs with the default
 * `audience: 'admin'`, so verbatim free-text ("other" answers, text/textarea
 * answers) is included in full — unlike the public results page, which
 * withholds it per-question unless opted in. This endpoint is read-only.
 */

type SurveyLike = { id: string | number; title?: unknown; tenant?: unknown }

/** Loads a survey's aggregate results, gated identically to the CSV exports. */
export async function handleSurveyResultsView(args: {
  payload: Payload
  user: unknown
  id: string | number | null | undefined
  req?: PayloadRequest
}): Promise<Response> {
  const { payload, user, req, id } = args
  if (id === null || id === undefined || id === '') {
    return Response.json({ ok: false, message: 'A survey id is required.' }, { status: 400 })
  }

  const survey = await findAccessibleDoc<SurveyLike>({
    payload,
    collection: 'surveys',
    id,
    user,
    req,
  })
  if (!survey) {
    return notFoundResponse()
  }

  const [questions, responses] = await Promise.all([
    loadSurveyQuestions(payload, survey.id),
    loadSurveyResponses(payload, survey.id),
  ])
  const aggregate = aggregateSurvey(questions, responses)

  return Response.json(
    {
      ok: true,
      survey: { id: survey.id, title: typeof survey.title === 'string' ? survey.title : '' },
      aggregate,
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export const surveyResultsEndpoints: Endpoint[] = [
  {
    path: '/:id/results',
    method: 'get',
    handler: async (req) =>
      handleSurveyResultsView({
        payload: req.payload,
        user: req.user,
        req,
        id: req.routeParams?.id as string | undefined,
      }),
  },
]
