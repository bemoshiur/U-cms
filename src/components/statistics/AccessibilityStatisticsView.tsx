import type { PayloadRequest } from 'payload'
import React from 'react'

import {
  ACCESSIBILITY_MENU_KEY,
  AUTOMATED_DIAGNOSIS_DISCLAIMER,
  DIAGNOSIS_STANDARD,
  SEVERITY_LABELS,
} from '@/accessibility/constants'
import { hasMenuAccess, isSuperUser } from '@/access/hasMenuAccess'
import { getAssignedTenantIds } from '@/access/tenantAccess'
import {
  buildItemizedReport,
  buildMonthlyStats,
  loadScanResults,
} from '@/site/accessibilityStatsData'

/**
 * Web-accessibility auto-diagnosis STATISTICS view (Phase 8, Task 8.2; ref 2-23 +
 * the itemized report). A custom top-level admin view at
 * `/admin/accessibility-statistics`. Two sections over the stored scan results:
 *   (1) MONTHLY TREND — inspected screens / inspections / errors / 심각·위험·경고 per
 *       year-month, a stacked-bar trend chart + a table (CSV export);
 *   (2) ITEMIZED REPORT — headed with the diagnosis standard (axe-core, WCAG 2.x /
 *       KWCAG 2.2-aligned), a per-severity chart, and a per-rule table (오류화면수 /
 *       발생수 / 준수율), with the honest automated-diagnosis disclaimer footer.
 *
 * Reuses the Phase-5 insights approach (SVG bars, no chart library) + the shared
 * loader (so the numbers match the CSV exactly). Gated on `statistics.
 * accessibility` + tenant-scoped (site selector over the caller's assigned sites).
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1100, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
}

const SEVERITY_BAR: Record<'critical' | 'danger' | 'warning', string> = {
  critical: '#b71c1c',
  danger: '#e65100',
  warning: '#f9a825',
}

function deny(msg: string): React.ReactElement {
  return (
    <div style={wrap}>
      <h1>웹접근성 자동진단 통계 (Web Accessibility Statistics)</h1>
      <p>{msg}</p>
    </div>
  )
}

function ymLabel(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}-${ym.slice(4)}` : ym
}

export async function AccessibilityStatisticsView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) return deny('You must be signed in.')
  if (!(await hasMenuAccess(req as PayloadRequest, ACCESSIBILITY_MENU_KEY))) {
    return deny('You do not have permission (requires Site Statistics · Accessibility).')
  }

  const sitesWhere = isSuperUser(user) ? undefined : { id: { in: getAssignedTenantIds(user) } }
  const sites = await payload.find({
    collection: 'sites',
    where: sitesWhere as never,
    sort: 'name',
    depth: 0,
    limit: 100,
    pagination: false,
    overrideAccess: true,
  })
  const siteOptions = sites.docs as { id: string | number; name?: unknown; siteId?: unknown }[]
  if (siteOptions.length === 0) return deny('No sites are assigned to your account.')

  const sp = props.searchParams ?? {}
  const requestedSite = firstParam(sp.site)
  const selectedSite =
    siteOptions.find((s) => String(s.id) === String(requestedSite))?.id ?? siteOptions[0]!.id

  const rows = await loadScanResults(payload, {
    query: { tenantId: selectedSite },
    req: req as PayloadRequest,
  })
  const monthly = buildMonthlyStats(rows)
  const report = buildItemizedReport(rows)

  const siteQs = `site=${encodeURIComponent(String(selectedSite))}`
  const statsExport = `/api/accessibilityScanResults/statistics/export?${siteQs}`
  const reportExport = `/api/accessibilityScanResults/report/export?${siteQs}`
  const maxMonthErrors = Math.max(1, ...monthly.rows.map((r) => r.errorCount))
  const maxSeverity = Math.max(1, ...report.bySeverity.map((s) => s.count))

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>웹접근성 자동진단 통계 (Auto-Diagnosis Statistics)</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        진단 기준 (Diagnosis standard): {DIAGNOSIS_STANDARD}
      </p>

      {/* Site selector. */}
      <form
        method="get"
        style={{ display: 'flex', gap: '1rem', alignItems: 'end', margin: '1rem 0' }}
      >
        <label>
          <div>사이트 (Site)</div>
          <select name="site" defaultValue={String(selectedSite)}>
            {siteOptions.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {typeof s.name === 'string' ? s.name : String(s.siteId ?? s.id)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">통계보기 (View statistics)</button>
      </form>

      {/* (1) Monthly trend. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ fontSize: '1.1rem' }}>월별 추이 (Monthly trend)</h2>
        <a href={statsExport}>엑셀 다운로드 (Export CSV)</a>
      </div>
      {monthly.rows.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500, #888)' }}>No results in range.</p>
      ) : (
        <div
          style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 140, margin: '1rem 0' }}
        >
          {monthly.rows.map((r) => (
            <div key={r.ym} style={{ textAlign: 'center', flex: '0 0 auto' }}>
              <div
                title={`${ymLabel(r.ym)}: 에러 ${r.errorCount}`}
                style={{
                  width: 28,
                  height: `${Math.round((r.errorCount / maxMonthErrors) * 110)}px`,
                  minHeight: 2,
                  margin: '0 auto',
                  background: 'var(--theme-error-500, #c62828)',
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <div style={{ fontSize: '.7rem', marginTop: 4 }}>{ymLabel(r.ym)}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>년월</th>
              <th style={cell}>검사화면수</th>
              <th style={cell}>검사건수</th>
              <th style={cell}>에러건수</th>
              <th style={cell}>심각건수</th>
              <th style={cell}>위험건수</th>
              <th style={cell}>경고건수</th>
            </tr>
          </thead>
          <tbody>
            {monthly.rows.length === 0 ? (
              <tr>
                <td style={cell} colSpan={7}>
                  No monthly data.
                </td>
              </tr>
            ) : (
              monthly.rows.map((r) => (
                <tr key={r.ym}>
                  <td style={cell}>{ymLabel(r.ym)}</td>
                  <td style={cell}>{r.inspectedScreens}</td>
                  <td style={cell}>{r.inspections}</td>
                  <td style={cell}>{r.errorCount}</td>
                  <td style={cell}>{r.criticalCount}</td>
                  <td style={cell}>{r.dangerCount}</td>
                  <td style={cell}>{r.warningCount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* (2) Itemized inspection report. */}
      <div
        style={{
          marginTop: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <h2 style={{ fontSize: '1.1rem' }}>항목별 점검 보고서 (Itemized inspection report)</h2>
        <a href={reportExport}>엑셀 다운로드 (Export CSV)</a>
      </div>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        진단 기준: {DIAGNOSIS_STANDARD} · 검사 화면수: {report.inspectedScreens.toLocaleString()} ·
        전체 준수율: {report.overallCompliance}%
      </p>

      {/* Per-severity chart (the report's category summary). */}
      <div style={{ margin: '1rem 0' }}>
        {report.bySeverity.map((s) => (
          <div
            key={s.severity}
            style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '.25rem 0' }}
          >
            <div style={{ width: 120, fontSize: '.85rem' }}>{SEVERITY_LABELS[s.severity]}</div>
            <div
              style={{
                width: `${Math.round((s.count / maxSeverity) * 100)}%`,
                minWidth: 2,
                height: 14,
                background: SEVERITY_BAR[s.severity],
                borderRadius: 3,
              }}
            />
            <div style={{ fontSize: '.85rem' }}>{s.count.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>진단항목 (rule)</th>
              <th style={cell}>설명</th>
              <th style={cell}>심각도</th>
              <th style={cell}>오류화면수</th>
              <th style={cell}>개선(발생수)</th>
              <th style={cell}>준수율</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td style={cell} colSpan={6}>
                  오류가 없습니다. (No violations recorded.)
                </td>
              </tr>
            ) : (
              report.rows.map((r) => (
                <tr key={r.ruleId}>
                  <td style={cell}>
                    {r.helpUrl ? (
                      <a href={r.helpUrl} target="_blank" rel="noreferrer">
                        {r.ruleId}
                      </a>
                    ) : (
                      r.ruleId
                    )}
                  </td>
                  <td style={cell}>{r.description}</td>
                  <td style={cell}>{SEVERITY_LABELS[r.severity]}</td>
                  <td style={cell}>{r.errorScreens}</td>
                  <td style={cell}>{r.occurrences}</td>
                  <td style={cell}>{r.complianceRate}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer disclaimer (2-23 주의사항). */}
      <p
        style={{
          marginTop: '1.5rem',
          padding: '.75rem 1rem',
          background: 'var(--theme-elevation-50, #f7f7f7)',
          borderRadius: 6,
          fontSize: '.85rem',
          color: 'var(--theme-elevation-600, #555)',
        }}
      >
        ⚠ 주의사항 (Cautions): {AUTOMATED_DIAGNOSIS_DISCLAIMER}
      </p>
    </div>
  )
}
