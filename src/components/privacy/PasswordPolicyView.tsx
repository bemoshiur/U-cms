import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { loadPasswordPolicyHistory, PASSWORD_POLICY_MENU_KEY } from '@/privacy/passwordPolicyData'

/**
 * Password-policy management view (Task 6C Part 1; legacy ref 3-9 비밀번호 작성
 * 규칙). A custom top-level admin view at `/admin/password-policies`, registered
 * in payload.config.ts and linked from the nav. SERVER component: reads the
 * caller from `initPageResult.req`, GATES on `system.passwordPolicies`, and
 * surfaces the CURRENT LIVE policy prominently plus the full version history
 * (created date, active flag, who created) over the EXISTING `passwordPolicies`
 * collection.
 *
 * Versions are created/edited via the collection's own built-in Payload editor
 * (linked below) — this view is the read/overview surface that makes the legacy
 * management experience legible: which version is live, and why.
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
}

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 900, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.5rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
  verticalAlign: 'top',
}
const muted: React.CSSProperties = { color: 'var(--theme-elevation-500, #888)' }

// Built from a variable so the `@next/next/no-html-link-for-pages` rule (which
// only fires on literal page paths) does not apply — these are Payload admin
// routes served by the catch-all, where a full-navigation anchor reliably
// re-renders the server-rendered collection editor (same rationale as
// StatisticsNavLink's variable hrefs).
const COLLECTION_BASE = '/admin/collections/passwordPolicies'
const createHref = `${COLLECTION_BASE}/create`
const editHref = (id: number | string): string => `${COLLECTION_BASE}/${String(id)}`

function formatDate(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
}

export async function PasswordPolicyView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Password Composition Rules</h1>
        <p>You must be signed in to manage the password policy.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, PASSWORD_POLICY_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Password Composition Rules</h1>
        <p>
          You do not have permission to manage the password policy (requires System · Password
          Composition Rules).
        </p>
      </div>
    )
  }

  const history = await loadPasswordPolicyHistory(payload)

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Password Composition Rules</h1>
      <p style={{ ...muted, marginTop: 0 }}>
        Legacy 비밀번호 작성 규칙 (ref 3-9). The <strong>most recently created</strong> version
        among those marked active is the single live policy shown to users. Deactivated versions are
        kept as history.
      </p>

      {/* CURRENT LIVE policy — surfaced prominently */}
      <section
        style={{
          margin: '1.25rem 0',
          padding: '1rem 1.25rem',
          border: '2px solid var(--theme-success-500, #198038)',
          borderRadius: 8,
          background: 'var(--theme-elevation-50, #fafafa)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-success-600, #0e6027)' }}>
          CURRENTLY LIVE POLICY
        </div>
        {history.active ? (
          <>
            <p style={{ whiteSpace: 'pre-wrap', margin: '.5rem 0 .25rem', fontSize: 15 }}>
              {history.active.ruleText}
            </p>
            <div style={{ ...muted, fontSize: 12 }}>
              Version #{String(history.active.id)} · created {formatDate(history.active.createdAt)}
              {history.active.createdBy ? ` · by ${history.active.createdBy}` : ''}
            </div>
          </>
        ) : (
          <p style={{ margin: '.5rem 0 0', color: 'var(--theme-warning-600, #b28600)' }}>
            No active policy. Users are shown no composition guidance until a version is marked
            active. (Enforcement in code is unaffected — see the note below.)
          </p>
        )}
      </section>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '.5rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16 }}>Version history</h2>
        <a href={createHref}>+ New version</a>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...cell, width: 60 }}>No.</th>
            <th style={cell}>Rule</th>
            <th style={{ ...cell, width: 110 }}>Status</th>
            <th style={{ ...cell, width: 170 }}>Created</th>
            <th style={{ ...cell, width: 140 }}>Created by</th>
          </tr>
        </thead>
        <tbody>
          {history.rows.length === 0 ? (
            <tr>
              <td style={cell} colSpan={5}>
                No password policy versions yet. <a href={createHref}>Create the first one.</a>
              </td>
            </tr>
          ) : (
            history.rows.map((r) => (
              <tr key={String(r.id)}>
                <td style={cell}>
                  <a href={editHref(r.id)}>{String(r.id)}</a>
                </td>
                <td style={{ ...cell, whiteSpace: 'pre-wrap' }}>{r.ruleText}</td>
                <td style={cell}>
                  {r.isCurrentActive ? (
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '.1rem .5rem',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#fff',
                        background: 'var(--theme-success-500, #198038)',
                      }}
                    >
                      LIVE
                    </span>
                  ) : r.isActive ? (
                    <span style={muted}>active (superseded)</span>
                  ) : (
                    <span style={muted}>inactive</span>
                  )}
                </td>
                <td style={cell}>{formatDate(r.createdAt)}</td>
                <td style={cell}>{r.createdBy ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <section style={{ marginTop: '1.5rem', fontSize: 13, ...muted }}>
        <p>
          <strong>Reactivating a prior version:</strong> because the live policy is the
          most-recently-<em>created</em> active version, toggling an old version&apos;s status back
          on does not make it live again while a newer active version exists. To restore an earlier
          rule, create a new version carrying that text and mark it active — it then becomes the
          most-recent active version and therefore the live one.
        </p>
        <p>
          <strong>Enforcement vs. display:</strong> this text is the guidance <em>shown</em> to
          users. The rules actually <em>enforced</em> (rejected at password entry) are fixed in code
          (<code>src/auth/validatePassword.ts</code>) and do not change when you edit this text —
          the legacy code-enforces / policy-text-displays split (Task 1D).
        </p>
      </section>
    </div>
  )
}

export default PasswordPolicyView
