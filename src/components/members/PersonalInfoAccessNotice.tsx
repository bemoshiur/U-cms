'use client'

import React from 'react'

/**
 * Personal-info access confirm-gate (Task 6A Part 2; feature-inventory ref 1-36
 * callout 5). The legacy Integrated Member Management screen pops a browser
 * `confirm()` when an operator opens a member's personal information —
 * '개인정보보호를 위해서 조회 시 이력을 쌓고있습니다. 확인 버튼을 클릭해주세요.'
 * ('For personal-information protection, a history is recorded at every lookup.
 * Please click Confirm.'). This component reproduces that acknowledgment on the
 * member DETAIL/EDIT view (mounted via `admin.components.edit.beforeDocumentControls`).
 *
 * ## This is a UI affordance, NOT the security boundary
 *
 * The AUTHORITATIVE capture is the server-side `members` `afterRead` hook
 * (`capturePersonalInfoView`), which logs the view to `personalInfoAccessLogs`
 * for EVERY single-document read — including a raw `GET /api/members/:id` that
 * never renders this component. So the audit row is written whether or not the
 * operator ever sees (or clicks) this notice; the notice only makes the legally
 * required disclosure visible in the UI, exactly as the legacy confirm did.
 */
export const PersonalInfoAccessNotice: React.FC = () => {
  const [acknowledged, setAcknowledged] = React.useState(false)

  if (acknowledged) {
    return null
  }

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        border: '1px solid var(--theme-warning-250, #e0b000)',
        borderRadius: '4px',
        background: 'var(--theme-warning-50, #fff8e1)',
        color: 'var(--theme-warning-800, #6b5200)',
        fontSize: '0.85rem',
        lineHeight: 1.4,
      }}
    >
      <span>
        For personal-information protection, every lookup of this member&rsquo;s personal
        information is recorded in the personal-info access history. Please acknowledge to continue.
      </span>
      <button
        type="button"
        onClick={() => setAcknowledged(true)}
        style={{
          flexShrink: 0,
          padding: '0.35rem 0.9rem',
          border: 'none',
          borderRadius: '4px',
          background: 'var(--theme-elevation-800, #333)',
          color: 'var(--theme-elevation-0, #fff)',
          cursor: 'pointer',
          fontSize: '0.8rem',
        }}
      >
        Confirm
      </button>
    </div>
  )
}

export default PersonalInfoAccessNotice
