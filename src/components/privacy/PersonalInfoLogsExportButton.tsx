'use client'

import { useConfig } from '@payloadcms/ui'
import React, { useState } from 'react'
import { createPortal } from 'react-dom'

import { branding } from '../../branding'

/**
 * Personal-info-access-history-export PURPOSE MODAL (Audit Fix 4; ref 3-8
 * callout 5-6, mirroring `MemberExportButton.tsx` / Task 6B Part 2). Surfaced
 * above the `personalInfoAccessLogs` LIST table
 * (`admin.components.beforeListTable`). This "log-of-logs" export is itself a
 * personal-info-adjacent access, so — just like the member export — it must be
 * accompanied by a stated PURPOSE (열람목적) that is recorded as immutable
 * evidence before the CSV is produced.
 *
 * ## The server is the enforcement point; this modal is the UX
 *
 * `POST /api/personalInfoAccessLogs/history/export` REJECTS a missing/blank
 * purpose with 400 and enforces the `privacy.personalInfoLogs` grant
 * server-side — a scripted caller cannot skip any of it. This modal
 * additionally disables its own submit until a purpose is entered, so the
 * requirement is obvious in the UI too, but the modal is never the boundary.
 *
 * v1 scope: this exports the unfiltered/default range (purpose-only body) —
 * it does not yet pass through the list view's own from/to/keyword/action
 * filters (see task-audit-fix4-report.md).
 */

type CategoryOption = { value: string; label: string }

// Same 4-option export-purpose set `MemberExportButton` uses for this SAME
// `personalInfoAccessLogs` collection's `purposeCategory` field (the
// collection's schema also allows `view`/`edit`, but those describe reading/
// editing a MEMBER's PII, not exporting this log — irrelevant to this trigger).
const CATEGORIES: CategoryOption[] = [
  { value: 'export', label: 'Data export (개인정보 다운로드)' },
  { value: 'inquiry_response', label: 'Inquiry response (문의 응대)' },
  { value: 'complaint_handling', label: 'Complaint handling (민원 처리)' },
  { value: 'other', label: 'Other (기타)' },
]

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.5)',
}

const dialogStyle: React.CSSProperties = {
  maxWidth: 460,
  width: '90%',
  background: 'var(--theme-elevation-0, #fff)',
  color: 'var(--theme-elevation-800, #18181b)',
  borderRadius: 8,
  padding: '24px 26px',
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
}

export function PersonalInfoLogsExportButton(): React.ReactElement {
  const { config } = useConfig()
  const apiRoute = (config as { routes?: { api?: string } } | undefined)?.routes?.api || '/api'

  const [open, setOpen] = useState(false)
  const [purpose, setPurpose] = useState('')
  const [category, setCategory] = useState('export')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = purpose.trim().length > 0 && !busy

  const close = (): void => {
    if (busy) {
      return
    }
    setOpen(false)
    setError(null)
  }

  const submit = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const resp = await fetch(`${apiRoute}/personalInfoAccessLogs/history/export`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purpose: purpose.trim(), purposeCategory: category }),
      })
      if (!resp.ok) {
        const body = (await resp.json().catch(() => null)) as { message?: string } | null
        setError(body?.message || `Export failed (${resp.status}).`)
        setBusy(false)
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'personal-info-access-history.csv'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setBusy(false)
      setOpen(false)
      setPurpose('')
    } catch {
      setError('Export failed. Please try again.')
      setBusy(false)
    }
  }

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="personal-info-logs-export-title"
            style={overlayStyle}
            onClick={close}
          >
            <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
              <h2
                id="personal-info-logs-export-title"
                style={{ margin: '0 0 6px', fontSize: '1.15rem' }}
              >
                Export access history
              </h2>
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: '.85rem',
                  lineHeight: 1.5,
                  color: 'var(--theme-elevation-600, #666)',
                }}
              >
                A purpose (열람목적) is required and is recorded as a new access-history row (an
                audit of this export itself) before the download runs.
              </p>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <div style={{ marginBottom: 4, fontSize: '.8rem' }}>Purpose category</div>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={busy}
                  style={{ width: '100%' }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'block', marginBottom: 8 }}>
                <div style={{ marginBottom: 4, fontSize: '.8rem' }}>
                  Purpose detail <span style={{ color: 'var(--theme-error-500, #da1e28)' }}>*</span>
                </div>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  disabled={busy}
                  rows={3}
                  placeholder="e.g. Handing the audit trail to an external auditor (ref #1234)"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </label>

              {error ? (
                <p
                  role="alert"
                  style={{
                    margin: '0 0 8px',
                    color: 'var(--theme-error-500, #da1e28)',
                    fontSize: '.85rem',
                  }}
                >
                  {error}
                </p>
              ) : null}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 4,
                    border: '1px solid var(--theme-elevation-150, #d4d4d8)',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSubmit}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 4,
                    border: 'none',
                    background: canSubmit
                      ? branding.colors.primary
                      : 'var(--theme-elevation-150, #d4d4d8)',
                    color: '#fff',
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {busy ? 'Exporting…' : 'Export CSV'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 .75rem' }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn--style-primary btn--size-small"
        style={{ cursor: 'pointer' }}
      >
        Export access history (열람목적)
      </button>
      {modal}
    </div>
  )
}

export default PersonalInfoLogsExportButton
