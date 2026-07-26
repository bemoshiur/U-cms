import React from 'react'

import { SATISFACTION_LEVELS, type SatisfactionSummary } from '@/content/satisfaction'
import { submitSatisfactionAction } from './satisfactionActions'

/**
 * Per-page satisfaction widget (Task 4E; refs 2-18/2-19). A no-JS `<form>` of
 * five radio levels (매우만족 → 매우불만족) posting to {@link submitSatisfactionAction}.
 * Rendered ONLY when the site's `satisfactionEnabled` toggle is on (the caller
 * gates it). Shows the current average + count (the legacy 만족도 index feeds
 * Phase-5 stats). Once the visitor has rated (member) it shows a thank-you
 * instead of the form. `pageKey` is the current path; `menuId` attaches the
 * per-menu dimension.
 */
export function SatisfactionWidget({
  pageKey,
  menuId,
  summary,
  alreadyRated,
  submitted,
  error,
}: {
  pageKey: string
  menuId?: string | number | null
  summary: SatisfactionSummary
  alreadyRated?: boolean
  submitted?: boolean
  error?: string
}) {
  return (
    <section className="satisfaction" aria-label="Page satisfaction">
      <h2 className="satisfaction__title">Was this page helpful?</h2>

      {summary.count > 0 ? (
        <p className="satisfaction__stats">
          Average rating <strong>{summary.average?.toFixed(2)}</strong> / 5
          {summary.percent !== null ? <> ({summary.percent}%)</> : null} from {summary.count}{' '}
          {summary.count === 1 ? 'response' : 'responses'}
        </p>
      ) : (
        <p className="satisfaction__stats satisfaction__stats--empty">
          Be the first to rate this page.
        </p>
      )}

      {error ? (
        <p className="satisfaction__error" role="alert">
          {error}
        </p>
      ) : null}

      {submitted || alreadyRated ? (
        <p className="satisfaction__thanks" role="status">
          Thank you for your feedback.
        </p>
      ) : (
        <form className="satisfaction__form" action={submitSatisfactionAction} method="post">
          <input type="hidden" name="pageKey" value={pageKey} />
          {menuId != null ? <input type="hidden" name="menuId" value={String(menuId)} /> : null}
          <fieldset className="satisfaction__levels">
            <legend className="satisfaction__legend">
              Rate this page (1 = very dissatisfied, 5 = very satisfied)
            </legend>
            {SATISFACTION_LEVELS.map((level) => (
              <label key={level.score} className="satisfaction__level">
                <input type="radio" name="score" value={String(level.score)} required />
                <span className="satisfaction__level-label">
                  {level.label} ({level.score})
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="button satisfaction__submit">
            Submit rating
          </button>
        </form>
      )}
    </section>
  )
}
