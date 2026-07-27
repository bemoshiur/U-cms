'use client'

import React from 'react'

/**
 * "일괄적용 / Batch Apply" control (Phase 8, Task 8.1b; ref 1-67, callout 4).
 * A minimal client component: pick a standard source, enter/confirm the selected
 * table names (comma/newline separated), and POST to the batch-apply endpoint
 * (self-gated on `standardization.tableSettings`), then reload. Kept simple —
 * per-row assignment is also available through the collection's own edit UI.
 */
const SOURCES = [
  { value: 'mois', label: '행정안전부 (MOIS)' },
  { value: 'institution', label: '기관 (Institution)' },
  { value: 'excluded', label: '제외 (Excluded)' },
  { value: 'unassigned', label: '미지정 (Unassigned)' },
]

export function BatchApplyForm(): React.ReactElement {
  const [source, setSource] = React.useState('mois')
  const [tables, setTables] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  async function apply(): Promise<void> {
    const tableNames = tables
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
    if (tableNames.length === 0) {
      setMsg('Enter at least one table name.')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/tableStandardSettings/batch-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableNames, standardSource: source }),
      })
      if (!res.ok) {
        setMsg(`Batch apply failed (HTTP ${res.status}).`)
        setBusy(false)
        return
      }
      window.location.reload()
    } catch {
      setMsg('Batch apply failed (network error).')
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-100, #eee)',
        borderRadius: 6,
        padding: '1rem',
        margin: '1rem 0',
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        alignItems: 'end',
      }}
    >
      <label>
        <div>표준출처 (Standard Source)</div>
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label style={{ flex: '1 1 320px' }}>
        <div>테이블명 (Table names — comma / newline separated)</div>
        <textarea
          value={tables}
          onChange={(e) => setTables(e.target.value)}
          rows={2}
          style={{ width: '100%' }}
          placeholder="e.g. posts, boards, members"
        />
      </label>
      <button
        type="button"
        onClick={apply}
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
        {busy ? '적용 중… (Applying…)' : '일괄적용 (Batch Apply)'}
      </button>
      {msg ? <span style={{ color: 'var(--theme-error-500, #c62828)' }}>{msg}</span> : null}
    </div>
  )
}
