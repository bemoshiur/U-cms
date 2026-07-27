import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { loadMetaInspection } from '@/endpoints/standardizationEngineExport'
import { STD_META_INSPECTION_MENU_KEY } from '@/standardization/constants'

/**
 * Meta Term Dictionary Inspection view (Phase 8, Task 8.1b; ref 1-66). A custom
 * top-level admin view at `/admin/meta-inspection` — a READ-ONLY conformance
 * grid over the LIVE database metadata, four rules per column (오류1..오류4). Gates
 * on `standardization.metaInspection`; reads via the shared loader (the SAME
 * source the CSV export uses). Filters: standard source, error type, FAIL-only,
 * keyword — all no-JS GET params.
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
const verdictCell = (fail: boolean): React.CSSProperties => ({
  ...cell,
  fontWeight: 600,
  color: fail ? 'var(--theme-error-500, #c62828)' : 'var(--theme-success-600, #1565c0)',
})

export async function MetaInspectionView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Meta Term Inspection</h1>
        <p>You must be signed in.</p>
      </div>
    )
  }
  if (!(await hasMenuAccess(req as PayloadRequest, STD_META_INSPECTION_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Meta Term Inspection (메타 용어사전 점검)</h1>
        <p>You do not have permission (requires the DBA · Meta Term Inspection grant).</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const source = firstParam(sp.source)?.trim() || 'mois'
  const errorType = firstParam(sp.errorType)?.trim() || undefined
  const failOnly = firstParam(sp.failOnly) === '1'
  const keyword = firstParam(sp.keyword)?.trim() || undefined

  const result = await loadMetaInspection(payload, {
    query: { source, errorType, failOnly, keyword },
    req: req as PayloadRequest,
  })

  const q = new URLSearchParams()
  q.set('source', source)
  if (errorType) q.set('errorType', errorType)
  if (failOnly) q.set('failOnly', '1')
  if (keyword) q.set('keyword', keyword)
  const exportHref = `/api/standardizationSelfChecks/meta-inspection/export?${q.toString()}`

  const errorTypeLabels = result.counts.map((c) => c.label)

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Meta Term Inspection (메타 용어사전 점검)</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Live-schema conformance check against the standard dictionaries. 오류1: physical name
        matches a term but the logical name (comment) differs · 오류2: logical matches but physical
        differs · 오류3: a column-name word is missing from the word dictionary · 오류4: no bound
        domain.
      </p>

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
          <div>표준출처 (Source)</div>
          <select name="source" defaultValue={source}>
            <option value="mois">행정안전부 (MOIS)</option>
            <option value="institution">기관 (Institution)</option>
          </select>
        </label>
        <label>
          <div>오류 구분 (Error Type)</div>
          <select name="errorType" defaultValue={errorType ?? ''}>
            <option value="">전체 (All)</option>
            {errorTypeLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div>오류여부 (Status)</div>
          <select name="failOnly" defaultValue={failOnly ? '1' : ''}>
            <option value="">전체 (All)</option>
            <option value="1">FAIL</option>
          </select>
        </label>
        <label style={{ flex: '1 1 220px' }}>
          <div>Keyword (테이블/컬럼/용어명)</div>
          <input
            type="search"
            name="keyword"
            defaultValue={keyword ?? ''}
            style={{ width: '100%' }}
          />
        </label>
        <button type="submit">검색 (Search)</button>
        <a href="?">초기화 (Reset)</a>
      </form>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <span style={{ color: 'var(--theme-elevation-500, #888)' }}>
          총 {result.total.toLocaleString()}건 · FAIL counts:{' '}
          {result.counts.map((c) => `${c.label}=${c.count}`).join(', ')}
        </span>
        <a href={exportHref}>전체엑셀다운로드 (Export CSV)</a>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>테이블명</th>
              <th style={cell}>용어약어명</th>
              <th style={cell}>용어명</th>
              <th style={cell}>데이터타입</th>
              <th style={cell}>도메인명</th>
              {errorTypeLabels.map((label) => (
                <th key={label} style={cell}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td style={cell} colSpan={5 + errorTypeLabels.length}>
                  No columns match your filter.
                </td>
              </tr>
            ) : (
              result.rows.slice(0, 500).map((r, i) => (
                <tr key={`${r.tableName}-${r.columnName}-${i}`}>
                  <td style={cell}>{r.tableName}</td>
                  <td style={cell}>{r.columnName}</td>
                  <td style={cell}>{r.logicalName}</td>
                  <td style={cell}>{r.dataType}</td>
                  <td style={cell}>{r.domain}</td>
                  {r.verdicts.map((v) => (
                    <td key={v.label} style={verdictCell(v.verdict === 'FAIL')}>
                      {v.verdict}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {result.rows.length > 500 ? (
        <p style={{ color: 'var(--theme-elevation-500, #888)' }}>
          Showing the first 500 rows — refine filters or export the full set to CSV.
        </p>
      ) : null}
    </div>
  )
}
