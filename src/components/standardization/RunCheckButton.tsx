'use client'

import React from 'react'

/**
 * "표준화 점검 / Run Check" action button (Phase 8, Task 8.1b; ref 1-75, callout 9).
 * A minimal client component: POSTs to the self-check run endpoint (which
 * re-runs the live introspection and overwrites the CURRENT year-month snapshot),
 * then reloads the view. The endpoint self-gates on `standardization.selfCheck`.
 */
export function RunCheckButton(): React.ReactElement {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function run(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/standardizationSelfChecks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!res.ok) {
        setError(`Run check failed (HTTP ${res.status}).`)
        setBusy(false)
        return
      }
      window.location.reload()
    } catch {
      setError('Run check failed (network error).')
      setBusy(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: '.75rem', alignItems: 'center' }}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        style={{
          background: 'var(--theme-success-500, #2e7d32)',
          color: '#fff',
          border: 0,
          borderRadius: 4,
          padding: '.5rem .9rem',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        {busy ? '점검 중… (Running…)' : '표준화 점검 (Run Check)'}
      </button>
      {error ? <span style={{ color: 'var(--theme-error-500, #c62828)' }}>{error}</span> : null}
    </span>
  )
}
