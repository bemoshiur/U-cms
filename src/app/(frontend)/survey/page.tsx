import { notFound } from 'next/navigation'
import React from 'react'

import { getActiveSite, getPayloadClient } from '@/site/rsc'
import { loadOpenSurveysForSite } from '@/site/survey'

/**
 * Public survey index (`/survey`, Task 4D Part 4). Lists the active site's
 * currently-OPEN surveys with links to each run page. Discovery entry point for
 * the survey system (surveys are not menu-bound); tenant-scoped via the active
 * site.
 */
export default async function SurveyIndexPage() {
  const site = await getActiveSite()
  if (!site) {
    notFound()
  }
  const payload = await getPayloadClient()
  const surveys = await loadOpenSurveysForSite(payload, site.id)

  return (
    <div className="page page--survey-index">
      <h1 className="page__title">Surveys</h1>
      {surveys.length === 0 ? (
        <p className="survey-notice">There are no open surveys at the moment.</p>
      ) : (
        <ul className="survey-index__list">
          {surveys.map((s) => (
            <li key={String(s.id)} className="survey-index__item">
              <a href={`/survey/${encodeURIComponent(String(s.id))}`}>{s.title}</a>
              {s.topic ? <span className="survey-index__topic"> — {s.topic}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
