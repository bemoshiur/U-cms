import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { loadPrivacyOrgChart, PRIVACY_ORG_MENU_KEY, type OrgTier } from '@/privacy/orgChart'

/**
 * Privacy organization chart view (Task 6C Part 2; legacy ref 3-10 개인정보
 * 조직도). A custom top-level admin view at `/admin/privacy-org-chart`,
 * registered in payload.config.ts and linked from the nav. SERVER component:
 * reads the caller from `initPageResult.req`, GATES on `privacy.orgChart`, and
 * renders the READ-ONLY governance hierarchy AUTO-DERIVED from privacy-role
 * assignments (officer → deputy → team → staff). Adding/removing an admin from
 * a privacy role re-derives the chart on the next render — it is never drawn by
 * hand. Empty tiers render as "unassigned" placeholders.
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
}

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 900, margin: '0 auto' }
const muted: React.CSSProperties = { color: 'var(--theme-elevation-500, #888)' }

function Connector(): React.ReactElement {
  return (
    <div
      aria-hidden
      style={{
        width: 2,
        height: 24,
        margin: '0 auto',
        background: 'var(--theme-elevation-200, #d4d4d8)',
      }}
    />
  )
}

function TierBlock({ tier }: { tier: OrgTier }): React.ReactElement {
  const isStaff = tier.tier === 4
  return (
    <section>
      <div
        style={{
          padding: '.4rem .9rem',
          maxWidth: 360,
          margin: '0 auto',
          textAlign: 'center',
          borderRadius: 6,
          background: 'var(--theme-elevation-100, #f1f1f4)',
          fontWeight: 700,
        }}
      >
        {tier.titleKo} · {tier.titleEn}
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '.75rem',
          justifyContent: 'center',
          marginTop: '.6rem',
        }}
      >
        {tier.members.length === 0 ? (
          <div
            style={{
              padding: '.6rem 1rem',
              border: '1px dashed var(--theme-elevation-200, #d4d4d8)',
              borderRadius: 6,
              ...muted,
              fontStyle: 'italic',
            }}
          >
            미지정 (unassigned)
          </div>
        ) : (
          tier.members.map((m) => (
            <div
              key={String(m.id)}
              style={{
                minWidth: 180,
                maxWidth: isStaff ? 200 : 320,
                padding: '.6rem .8rem',
                border: '1px solid var(--theme-elevation-150, #d4d4d8)',
                borderRadius: 6,
                background: 'var(--theme-input-bg, #fff)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              {m.department ? (
                <div style={{ ...muted, fontSize: 13, marginTop: 2 }}>{m.department}</div>
              ) : null}
              <div
                style={{ fontSize: 12, marginTop: 4, color: 'var(--theme-elevation-600, #52525b)' }}
              >
                {m.duty}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

export async function PrivacyOrgChartView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Privacy Organization Chart</h1>
        <p>You must be signed in to view the privacy organization chart.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, PRIVACY_ORG_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Privacy Organization Chart</h1>
        <p>
          You do not have permission to view the privacy organization chart (requires Privacy ·
          Privacy Organization Chart).
        </p>
      </div>
    )
  }

  const tiers = await loadPrivacyOrgChart(payload)

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Privacy Organization Chart</h1>
      <p style={{ ...muted, marginTop: 0 }}>
        Legacy 개인정보 조직도 (ref 3-10). Auto-generated from privacy-role assignments — assigning
        an admin to a privacy role updates this chart automatically. This screen is read-only;
        manage the assignments in Admin Role Management / Admin Account Management.
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        {tiers.map((tier, i) => (
          <div key={tier.roleId}>
            {i > 0 ? <Connector /> : null}
            <TierBlock tier={tier} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default PrivacyOrgChartView
