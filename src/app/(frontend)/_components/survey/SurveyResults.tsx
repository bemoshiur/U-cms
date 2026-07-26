import React from 'react'

import type { SurveyAggregate } from '@/content/survey'

/**
 * Public survey results view (Task 4D Part 4; ref 2-12). Renders the pure
 * {@link SurveyAggregate} (from `aggregateSurvey`) as per-question bar charts
 * (option counts + percentages) and, for text questions, the list of free-text
 * answers. Percentages are of respondents who ANSWERED that question. Whether
 * this renders at all is decided upstream by `resultsVisible` (per
 * `survey.resultVisibility`).
 */
export function SurveyResults({ aggregate }: { aggregate: SurveyAggregate }) {
  return (
    <section className="survey-results" aria-label="Survey results">
      <p className="survey-results__total">Total responses: {aggregate.totalResponses}</p>

      {aggregate.questions.map((q) => (
        <div key={String(q.questionId ?? q.order)} className="survey-results__question">
          <h3 className="survey-results__q-text">{q.text}</h3>

          {q.type === 'single' || q.type === 'multi' ? (
            <ul className="survey-results__options">
              {q.options.map((o) => (
                <li key={o.value} className="survey-results__option">
                  <span className="survey-results__option-label">{o.label}</span>
                  <span
                    className="survey-results__bar"
                    style={{ display: 'inline-block', width: `${Math.min(100, o.percentage)}%` }}
                    aria-hidden="true"
                  />
                  <span className="survey-results__option-count">
                    {o.count} ({o.percentage}%)
                  </span>
                </li>
              ))}
              {q.otherTexts.length > 0 ? (
                <li className="survey-results__others">
                  <strong>Other answers:</strong>
                  <ul>
                    {q.otherTexts.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </li>
              ) : null}
            </ul>
          ) : (
            <div className="survey-results__texts">
              <p className="survey-results__answered">{q.answeredCount} text answer(s)</p>
              <ul>
                {q.textAnswers.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
