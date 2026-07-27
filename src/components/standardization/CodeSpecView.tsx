import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { STD_CODE_SPEC_MENU_KEY, loadCodeSpec } from '@/site/codeSpecData'

/**
 * Code Specification report admin view (Phase 8, Task 8.1a; ref 1-74). A custom
 * top-level admin view at `/admin/code-specification`, registered in
 * payload.config.ts and linked from the nav. SERVER component: reads the caller
 * from `initPageResult.req`, GATES on `standardization.codeSpec`, and renders a
 * classification+keyword-filterable, READ-ONLY table over the EXISTING common
 * codes (분류 / 구분 / 코드ID / 상위코드 / 코드 / 코드명 / 코드영문명 / 등록일) with a
 * 전체엑셀다운로드 CSV link. Reads via the shared `codeSpecData` helper — the SAME
 * source the CSV export uses — with `overrideAccess: true` because this view's
 * own gate already authorized the caller.
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1200, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
  verticalAlign: 'top',
}

export async function CodeSpecView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Code Specification</h1>
        <p>You must be signed in to view the code specification.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, STD_CODE_SPEC_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Code Specification (코드 명세서)</h1>
        <p>
          You do not have permission to view the code specification (requires the DBA / Public Data
          Standardization · Code Specification grant).
        </p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const classification = firstParam(sp.classification)?.trim() || undefined
  const keyword = firstParam(sp.keyword)?.trim() || undefined

  const result = await loadCodeSpec(payload, {
    query: { classification, keyword },
    req: req as PayloadRequest,
  })

  const q = new URLSearchParams()
  if (classification) q.set('classification', classification)
  if (keyword) q.set('keyword', keyword)
  const exportHref = `/api/codes/code-spec/export${q.toString() ? `?${q.toString()}` : ''}`

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Code Specification (코드 명세서)</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Read-only inventory of all system common codes. Filter by classification and keyword; export
        the full result set to Excel (CSV) for audit (감리) submission.
      </p>

      {/* Controls — no-JS GET form */}
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
          <div>Classification (분류)</div>
          <select name="classification" defaultValue={classification ?? ''}>
            <option value="">전체 (All)</option>
            {result.classifications.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 240px' }}>
          <div>Keyword (코드ID / 코드 / 코드명)</div>
          <input
            type="search"
            name="keyword"
            defaultValue={keyword ?? ''}
            placeholder="e.g. APRV_CD, 승인, AVU001"
            style={{ width: '100%' }}
          />
        </label>
        <button type="submit">검색 (Search)</button>
        {/* Reset = clear all query params on the current path (avoids a literal
            page-path href, which the next/link lint rule flags). */}
        <a href="?">초기화 (Reset)</a>
      </form>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '.5rem',
        }}
      >
        <span style={{ color: 'var(--theme-elevation-500, #888)' }}>
          총 {result.total.toLocaleString()}건
        </span>
        <a href={exportHref}>전체엑셀다운로드 (Export CSV)</a>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>분류</th>
            <th style={cell}>구분</th>
            <th style={cell}>코드ID</th>
            <th style={cell}>상위코드</th>
            <th style={cell}>코드</th>
            <th style={cell}>코드명</th>
            <th style={cell}>코드영문명</th>
            <th style={cell}>등록일</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 ? (
            <tr>
              <td style={cell} colSpan={8}>
                No codes match your search.
              </td>
            </tr>
          ) : (
            result.rows.map((r, i) => (
              <tr key={`${r.codeId}-${r.code}-${i}`}>
                <td style={cell}>{r.classification}</td>
                <td style={cell}>{r.codeGroupName}</td>
                <td style={cell}>{r.codeId}</td>
                <td style={cell}>{r.parentCode}</td>
                <td style={cell}>{r.code}</td>
                <td style={cell}>{r.codeName}</td>
                <td style={cell}>{r.englishName}</td>
                <td style={cell}>{r.registeredAt ? r.registeredAt.slice(0, 10) : ''}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
