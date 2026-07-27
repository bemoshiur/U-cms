'use client'

import React from 'react'

/**
 * Delete action for one accessibility scan result row (Phase 8, Task 8.2; 2-21
 * callout 7 삭제). A minimal client component: confirms, then DELETEs the row via
 * the Payload REST route `/api/accessibilityScanResults/:id` (gated by the
 * collection's own `tenantScopedMenuAccess(statistics.accessibility)` — so an
 * unauthorized caller is rejected server-side), then reloads the view.
 */
export function DeleteScanResultButton({ id }: { id: string | number }): React.ReactElement {
  const [busy, setBusy] = React.useState(false)

  async function remove(): Promise<void> {
    if (!window.confirm('이 검사 결과를 삭제하시겠습니까? (Delete this scan result?)')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/accessibilityScanResults/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        window.alert(`삭제 실패 (Delete failed, HTTP ${res.status}).`)
        setBusy(false)
        return
      }
      window.location.reload()
    } catch {
      window.alert('삭제 실패 (network error).')
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      style={{
        border: '1px solid var(--theme-error-500, #c62828)',
        color: 'var(--theme-error-500, #c62828)',
        background: 'transparent',
        borderRadius: 4,
        padding: '.2rem .5rem',
        cursor: busy ? 'default' : 'pointer',
        fontSize: '.8rem',
      }}
    >
      {busy ? '삭제 중…' : '삭제'}
    </button>
  )
}
