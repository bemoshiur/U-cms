'use client'

import { useConfig, useDocumentInfo } from '@payloadcms/ui'
import React, { useState } from 'react'

import type { SurveyAggregate } from '@/content/survey'
import { SurveyResults } from '@/app/(frontend)/_components/survey/SurveyResults'

/**
 * Survey admin RESULTS panel (Audit Fix 5; ref 2-12). Mounted on the survey
 * EDIT screen via `admin.components.edit.beforeDocumentControls` (see
 * `src/collections/surveys/Surveys.ts`) — the same integration point Users.ts
 * (`PasswordPolicyNotice`) and Members.ts (`MemberDetailWatermark`) use for a
 * small per-document admin panel, deliberately chosen so this stays clear of
 * `payload.config.ts`'s top-level `views`/`afterNavLinks` registration.
 *
 * `resultsVisible(survey, 'admin')` (`src/content/survey.ts`) is
 * UNCONDITIONALLY true — an admin who can open this edit screen at all (the
 * `surveys` collection's own tenant-scoped `access.read` already gates
 * reaching it) always gets to see aggregate results, regardless of the
 * survey's public `resultVisibility` setting. This panel is a click-to-load
 * toggle (not auto-fetched on mount) so opening the edit screen never fires an
 * extra request when the admin doesn't care about results; it fetches
 * `GET /api/surveys/:id/results` (`src/endpoints/surveyResults.ts`), which
 * re-checks the same read access server-side (collapsing missing/cross-tenant/
 * forbidden to one 404 — this panel is NOT the security boundary, the endpoint
 * is), then renders the result with the SAME {@link SurveyResults} component
 * the public results page uses (reused directly — it is a plain, portable
 * presentational component with no route-specific APIs) so the two "same
 * data, same visualization" surfaces stay visually consistent.
 *
 * No separate "at least one response" empty state is needed:
 * `aggregateSurvey` already returns a well-formed zero-response aggregate
 * (`totalResponses: 0`, every question's counts at 0), and `SurveyResults`
 * already renders that gracefully ("Total responses: 0"), so a survey with no
 * responses yet just shows that plainly instead of a special-cased message.
 */

type ResultsResponse = {
  ok: boolean
  message?: string
  survey?: { id: string | number; title: string }
  aggregate?: SurveyAggregate
}

export function SurveyResultsPanel(): React.ReactElement | null {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const apiRoute = (config as { routes?: { api?: string } } | undefined)?.routes?.api || '/api'

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aggregate, setAggregate] = useState<SurveyAggregate | null>(null)

  // Nothing to show yet on the "create new survey" screen (no id).
  if (id === undefined || id === null || id === '') {
    return null
  }

  const load = async (): Promise<void> => {
    if (aggregate || loading) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${apiRoute}/surveys/${encodeURIComponent(String(id))}/results`, {
        credentials: 'include',
      })
      const body = (await resp.json().catch(() => null)) as ResultsResponse | null
      if (!resp.ok || !body?.ok || !body.aggregate) {
        setError(body?.message || `Could not load results (${resp.status}).`)
        setLoading(false)
        return
      }
      setAggregate(body.aggregate)
      setLoading(false)
    } catch {
      setError('Could not load results. Please try again.')
      setLoading(false)
    }
  }

  const toggle = (): void => {
    const next = !open
    setOpen(next)
    if (next) {
      void load()
    }
  }

  return (
    <div className="survey-results-panel" style={{ margin: '0 0 1rem' }}>
      <button
        type="button"
        onClick={toggle}
        className="btn btn--style-secondary btn--size-small"
        style={{ cursor: 'pointer' }}
        aria-expanded={open}
      >
        {open ? 'Hide results' : 'View results'}
      </button>
      {open ? (
        <div
          style={{
            marginTop: 10,
            padding: '.75rem 1rem',
            border: '1px solid var(--theme-elevation-150, #d4d4d8)',
            borderRadius: 6,
            background: 'var(--theme-elevation-50, #fafafa)',
          }}
        >
          {loading ? <p>Loading results…</p> : null}
          {error ? (
            <p role="alert" style={{ color: 'var(--theme-error-500, #da1e28)' }}>
              {error}
            </p>
          ) : null}
          {aggregate ? <SurveyResults aggregate={aggregate} /> : null}
        </div>
      ) : null}
    </div>
  )
}

export default SurveyResultsPanel
