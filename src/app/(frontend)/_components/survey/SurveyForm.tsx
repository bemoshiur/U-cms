import React from 'react'

import type { SurveyQuestionLike } from '@/content/survey'
import { submitSurveyAction } from '../../survey/[id]/actions'

/**
 * Public survey run form (Task 4D Part 4; refs 2-11, 2-12). Renders the survey's
 * questions IN ORDER and posts to the {@link submitSurveyAction} server action.
 *
 * Field names encode `<type>_<order>` (see the action) so parsing needs no DB
 * lookup. HTML5 `required` is intentionally NOT set: skip logic (ref 2-11) makes
 * a question's requiredness dynamic, so it is enforced SERVER-SIDE (the pure
 * `reachableQuestionOrders` walk) — a respondent who answers only the reachable
 * questions is accepted. This linear render (all questions shown) is the
 * baseline; client-side progressive branching is a later enhancement. An "other"
 * option always renders its free-text box (no-JS friendly); it is only required
 * server-side when that option is actually chosen.
 */
export function SurveyForm({
  surveyId,
  questions,
  error,
}: {
  surveyId: string | number
  questions: SurveyQuestionLike[]
  error?: string
}) {
  const ordered = [...questions]
    .filter((q) => typeof q.order === 'number')
    .sort((a, b) => (a.order as number) - (b.order as number))

  return (
    <form action={submitSurveyAction} className="survey-form" method="post">
      <input type="hidden" name="surveyId" value={String(surveyId)} />
      {error ? (
        <p className="survey-form__error" role="alert">
          {error}
        </p>
      ) : null}

      {ordered.map((q) => {
        const order = q.order as number
        const options = q.options ?? []
        return (
          <fieldset key={order} className="survey-question">
            <legend className="survey-question__text">
              {q.text}
              {q.required ? <span aria-hidden="true"> *</span> : null}
            </legend>

            {q.type === 'single'
              ? options.map((o, i) => (
                  <label key={i} className="survey-option">
                    <input type="radio" name={`single_${order}`} value={String(o.value ?? '')} />
                    <span>{o.label}</span>
                    {o.isOther ? (
                      <input
                        type="text"
                        name={`other_${order}`}
                        className="survey-option__other"
                        aria-label={`${q.text} — other`}
                        placeholder="Please specify"
                      />
                    ) : null}
                  </label>
                ))
              : null}

            {q.type === 'multi'
              ? options.map((o, i) => (
                  <label key={i} className="survey-option">
                    <input type="checkbox" name={`multi_${order}`} value={String(o.value ?? '')} />
                    <span>{o.label}</span>
                    {o.isOther ? (
                      <input
                        type="text"
                        name={`other_${order}`}
                        className="survey-option__other"
                        aria-label={`${q.text} — other`}
                        placeholder="Please specify"
                      />
                    ) : null}
                  </label>
                ))
              : null}

            {q.type === 'text' ? (
              <input type="text" name={`text_${order}`} className="survey-text" />
            ) : null}

            {q.type === 'textarea' ? (
              <textarea name={`text_${order}`} className="survey-textarea" rows={4} />
            ) : null}
          </fieldset>
        )
      })}

      <button type="submit" className="survey-form__submit">
        Submit response
      </button>
    </form>
  )
}
