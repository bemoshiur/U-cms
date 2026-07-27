import type { PayloadRequest } from 'payload'
import React from 'react'

import {
  ACCESSIBILITY_MENU_KEY,
  AUTOMATED_DIAGNOSIS_DISCLAIMER,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
} from '@/accessibility/constants'
import { hasMenuAccess, isSuperUser } from '@/access/hasMenuAccess'
import { getAssignedTenantIds } from '@/access/tenantAccess'
import {
  buildResultsSummary,
  loadScanResults,
  type ScanResultRow,
} from '@/site/accessibilityStatsData'
import { DeleteScanResultButton } from './DeleteScanResultButton'

/**
 * Web-accessibility auto-diagnosis RESULTS view (Phase 8, Task 8.2; refs 2-21 +
 * 2-22). A custom top-level admin view at `/admin/accessibility-diagnosis`. The
 * 2-21 list (summary strip + per-screen rows + filter + CSV + delete) PLUS the
 * 2-22 per-screen DETAIL pane (rendered when `?resultId=` is set): violations
 * grouped by 심각/위험/경고, each with the axe rule description, occurrence count,
 * a help link (axe helpUrl), and — from the STORED result — the offending HTML
 * snippet + failure reason. This replaces the legacy LIVE on-page overlay with a
 * stored-result detail view (plan §2.7 simplification).
 *
 * SERVER component: gates on `statistics.accessibility`, scopes the site selector
 * to the caller's assigned sites (super → all), reads via the shared loader with
 * `overrideAccess` (this view's own gate + tenant constraint already authorized).
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1280, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
  verticalAlign: 'top',
}
const chip = (color: string): React.CSSProperties => ({
  display: 'inline-block',
  padding: '.1rem .45rem',
  borderRadius: 10,
  background: color,
  color: '#fff',
  fontSize: '.75rem',
})

const SEVERITY_COLOR: Record<(typeof SEVERITY_ORDER)[number], string> = {
  critical: '#b71c1c',
  danger: '#e65100',
  warning: '#f9a825',
}

function deny(msg: string): React.ReactElement {
  return (
    <div style={wrap}>
      <h1>웹접근성 자동진단 결과 (Web Accessibility Auto-Diagnosis)</h1>
      <p>{msg}</p>
    </div>
  )
}

export async function AccessibilityDiagnosisView(props: ViewProps): Promise<React.ReactElement> {
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
  const keyword = firstParam(sp.keyword)?.trim() || undefined
  const source = firstParam(sp.source)?.trim() || undefined
  const detailId = firstParam(sp.resultId)

  const rows = await loadScanResults(payload, {
    query: { tenantId: selectedSite, keyword, source },
    req: req as PayloadRequest,
  })
  const summary = buildResultsSummary(rows)
  const detail = detailId ? rows.find((r) => String(r.id) === String(detailId)) : undefined

  const qs = new URLSearchParams()
  qs.set('site', String(selectedSite))
  if (keyword) qs.set('keyword', keyword)
  if (source) qs.set('source', source)
  const exportHref = `/api/accessibilityScanResults/results/export?${qs.toString()}`
  const linkBase = `?${qs.toString()}`

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>웹접근성 자동진단 결과 (Auto-Diagnosis Results)</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        진단 기준 (standard): axe-core (WCAG 2.x / KWCAG 2.2-aligned).{' '}
        {AUTOMATED_DIAGNOSIS_DISCLAIMER}
      </p>

      {/* Filter (2-21 callout 1): site + keyword + source (no-JS GET form). */}
      <form
        method="get"
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'end',
          margin: '1rem 0',
        }}
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
        <label>
          <div>구분 (Source)</div>
          <select name="source" defaultValue={source ?? ''}>
            <option value="">전체 (All)</option>
            <option value="scan">Scan runner</option>
            <option value="popup">Popup</option>
            <option value="db">DB-store</option>
          </select>
        </label>
        <label>
          <div>검색어 (Keyword)</div>
          <input name="keyword" defaultValue={keyword ?? ''} placeholder="화면명 / 경로" />
        </label>
        <button type="submit">검색 (Search)</button>
        <a href={exportHref}>항목별 CSV (Export)</a>
        <a
          href={`/admin/accessibility-statistics?site=${encodeURIComponent(String(selectedSite))}`}
        >
          항목별 점검 보고서 (Report/Statistics)
        </a>
      </form>

      {/* Summary strip (2-21 callouts 3/4). */}
      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', margin: '1rem 0' }}>
        {[
          ['검사 화면수', summary.inspectedScreens],
          ['검사 항목수', summary.checkedItems],
          ['성공 항목수', summary.successItems],
          ['에러 항목수', summary.errorItems],
          ['심각', summary.criticalCount],
          ['위험', summary.dangerCount],
          ['경고', summary.warningCount],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
              {(value as number).toLocaleString()}
            </div>
            <div style={{ color: 'var(--theme-elevation-500, #888)', fontSize: '.8rem' }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Results table (2-21). */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>화면명</th>
              <th style={cell}>경로</th>
              <th style={cell}>전체</th>
              <th style={cell}>성공</th>
              <th style={cell}>에러</th>
              <th style={cell}>심각</th>
              <th style={cell}>위험</th>
              <th style={cell}>경고</th>
              <th style={cell}>검사일시</th>
              <th style={cell}>상세</th>
              <th style={cell}>삭제</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td style={cell} colSpan={11}>
                  검사 결과가 없습니다. (No scan results — run the scan runner or enable the site
                  validation toggle.)
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)}>
                  <td style={cell}>{r.screenName}</td>
                  <td style={cell}>{r.route}</td>
                  <td style={cell}>{r.totalItems}</td>
                  <td style={cell}>{r.successCount}</td>
                  <td style={cell}>{r.errorCount}</td>
                  <td style={cell}>{r.criticalCount}</td>
                  <td style={cell}>{r.dangerCount}</td>
                  <td style={cell}>{r.warningCount}</td>
                  <td style={cell}>
                    {r.inspectedAt ? r.inspectedAt.slice(0, 19).replace('T', ' ') : ''}
                  </td>
                  <td style={cell}>
                    <a href={`${linkBase}&resultId=${encodeURIComponent(String(r.id))}`}>
                      바로가기
                    </a>
                  </td>
                  <td style={cell}>
                    <DeleteScanResultButton id={r.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Per-screen DETAIL pane (2-22) — stored-result view of one row. */}
      {detail ? <AccessibilityDetailPane row={detail} clearHref={linkBase} /> : null}
    </div>
  )
}

/** 2-22 detail: violations grouped by severity, each with rule + occurrence + help + offending HTML. */
function AccessibilityDetailPane({
  row,
  clearHref,
}: {
  row: ScanResultRow
  clearHref: string
}): React.ReactElement {
  const grouped = SEVERITY_ORDER.map((sev) => ({
    sev,
    items: row.violations.filter((v) => v.severity === sev),
  })).filter((g) => g.items.length > 0)

  return (
    <section style={{ marginTop: '2rem', borderTop: '2px solid var(--theme-elevation-150, #ddd)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ marginBottom: '.25rem' }}>
          U-CMS 접근성 자가검진: {row.violations.length}가지의 지침 오류 — {row.screenName} (
          {row.route})
        </h2>
        <a href={clearHref}>닫기 (Clear)</a>
      </div>
      {grouped.length === 0 ? (
        <p style={{ color: 'var(--theme-success-500, #2e7d32)' }}>
          발견된 오류가 없습니다. (No violations recorded for this screen.)
        </p>
      ) : (
        grouped.map((g) => (
          <div key={g.sev} style={{ margin: '1rem 0' }}>
            <h3>
              <span style={chip(SEVERITY_COLOR[g.sev])}>{SEVERITY_LABELS[g.sev]}</span> (
              {g.items.length})
            </h3>
            {g.items.map((v, i) => (
              <div
                key={`${v.ruleId}-${i}`}
                style={{
                  border: '1px solid var(--theme-elevation-100, #eee)',
                  borderRadius: 6,
                  padding: '.6rem .8rem',
                  margin: '.5rem 0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <strong>
                    {v.description}{' '}
                    <code style={{ fontSize: '.8rem', color: 'var(--theme-elevation-500,#888)' }}>
                      {v.ruleId}
                    </code>
                  </strong>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    발생 {v.occurrenceCount}
                    {v.helpUrl ? (
                      <>
                        {' · '}
                        <a href={v.helpUrl} target="_blank" rel="noreferrer">
                          도움말
                        </a>
                      </>
                    ) : null}
                  </span>
                </div>
                {v.sampleHtml ? (
                  <div style={{ marginTop: '.4rem' }}>
                    <div style={{ fontSize: '.8rem', color: 'var(--theme-elevation-500,#888)' }}>
                      대상 보기 (Target HTML)
                    </div>
                    <pre
                      style={{
                        margin: '.2rem 0',
                        padding: '.4rem .6rem',
                        background: 'var(--theme-elevation-50, #f7f7f7)',
                        borderRadius: 4,
                        overflowX: 'auto',
                        fontSize: '.8rem',
                      }}
                    >
                      {v.sampleHtml}
                    </pre>
                  </div>
                ) : null}
                {v.failureSummary ? (
                  <div style={{ marginTop: '.3rem' }}>
                    <div style={{ fontSize: '.8rem', color: 'var(--theme-elevation-500,#888)' }}>
                      개선 방향 (Failure / remediation)
                    </div>
                    <pre
                      style={{
                        margin: '.2rem 0',
                        whiteSpace: 'pre-wrap',
                        fontSize: '.8rem',
                      }}
                    >
                      {v.failureSummary}
                    </pre>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  )
}
