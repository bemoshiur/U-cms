'use client'

import { useConfig } from '@payloadcms/ui'
import React, { useState } from 'react'
import { createPortal } from 'react-dom'

import { branding } from '../../branding'

/**
 * Member-export PURPOSE MODAL (Task 6B Part 2; feature-inventory refs 1-36
 * callout 2/4, 3-8 callout 6). Surfaced above the member-management LIST table
 * (`admin.components.beforeListTable`). ANY export of member personal
 * information must be accompanied by a stated PURPOSE (열람목적) that is recorded
 * as immutable evidence — so this opens a modal collecting the purpose (+ a
 * category), then POSTs it to the Task 6A purpose-gated endpoint
 * (`POST /api/members/export`), which downloads a CSV.
 *
 * ## The server is the enforcement point; this modal is the UX
 *
 * The endpoint REJECTS a missing/blank purpose with 400 and enforces the
 * `members.manage` grant + tenant scope server-side (Task 6A) — a scripted
 * caller cannot skip any of it. This modal additionally disables its own submit
 * until a purpose is entered, so the requirement is obvious in the UI too, but
 * the modal is never the boundary. The endpoint also tiers PII disclosure in the
 * CSV by the privacy-officer grant (masked for a plain manager, full for a
 * privacy officer) — the UI does not need to know which; it just downloads what
 * the server returns.
 */

type CategoryOption = { value: string; label: string }

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

export function MemberExportButton(): React.ReactElement {
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
      const resp = await fetch(`${apiRoute}/members/export`, {
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
      anchor.download = 'members.csv'
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
            aria-labelledby="member-export-title"
            style={overlayStyle}
            onClick={close}
          >
            <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
              <h2 id="member-export-title" style={{ margin: '0 0 6px', fontSize: '1.15rem' }}>
                Export members
              </h2>
              <p
                style={{
                  margin: '0 0 16px',
                  fontSize: '.85rem',
                  lineHeight: 1.5,
                  color: 'var(--theme-elevation-600, #666)',
                }}
              >
                A purpose (열람목적) is required and is recorded in the personal-info access history
                as permanent evidence before the export runs.
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
                  placeholder="e.g. Responding to a member data-access request (ref #1234)"
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
        Export members (열람목적)
      </button>
      {modal}
    </div>
  )
}

export default MemberExportButton
