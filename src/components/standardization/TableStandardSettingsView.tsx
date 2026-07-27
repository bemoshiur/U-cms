import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { loadTableStandardSettings } from '@/endpoints/tableStandardEndpoints'
import { STD_TABLE_SETTINGS_MENU_KEY, TABLE_SOURCE_OPTIONS } from '@/standardization/constants'
import { BatchApplyForm } from './BatchApplyForm'

/**
 * Table Standard Settings view (Phase 8, Task 8.1b; ref 1-67). Lists the LIVE
 * physical tables merged with their stored standard-source assignment, shows the
 * per-source summary strip, offers batch apply (일괄적용) + CSV, and links to the
 * collection UI for per-row edits. Gated on `standardization.tableSettings`.
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

const SOURCE_LABEL = new Map<string, string>(TABLE_SOURCE_OPTIONS.map((o) => [o.value, o.label]))

export async function TableStandardSettingsView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Table Standard Settings</h1>
        <p>You must be signed in.</p>
      </div>
    )
  }
  if (!(await hasMenuAccess(req as PayloadRequest, STD_TABLE_SETTINGS_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Table Standard Settings (테이블 표준 설정)</h1>
        <p>You do not have permission (requires the DBA · Table Standard Settings grant).</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const source = firstParam(sp.source)?.trim() || undefined
  const keyword = firstParam(sp.keyword)?.trim() || undefined

  const result = await loadTableStandardSettings(payload, {
    query: { source, keyword },
    req: req as PayloadRequest,
  })

  const q = new URLSearchParams()
  if (source) q.set('source', source)
  if (keyword) q.set('keyword', keyword)
  const exportHref = `/api/tableStandardSettings/tables/export${q.toString() ? `?${q}` : ''}`
  // A variable (not a literal page path) so the next/link lint rule doesn't
  // apply — a hard anchor reliably re-renders the Payload-served collection view
  // (same approach as ErrorStatisticsView's "Open full error log" link).
  const collectionHref = '/admin/collections/tableStandardSettings'
  const { summary } = result

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Table Standard Settings (테이블 표준 설정)</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Assign the standardization source each physical table conforms to. The source governs which
        rules the table is validated against in the self-check.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1.5rem',
          flexWrap: 'wrap',
          margin: '1rem 0',
          fontWeight: 600,
        }}
      >
        <span>총 테이블수: {summary.total}건</span>
        <span>행정안전부: {summary.mois}건</span>
        <span>기관: {summary.institution}건</span>
        <span>제외: {summary.excluded}건</span>
        <span>미지정: {summary.unassigned}건</span>
      </div>

      <BatchApplyForm />

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
          <select name="source" defaultValue={source ?? ''}>
            <option value="">전체 (All)</option>
            {TABLE_SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: '1 1 240px' }}>
          <div>Keyword (테이블명/설명)</div>
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
        }}
      >
        <span style={{ color: 'var(--theme-elevation-500, #888)' }}>총 {result.rows.length}건</span>
        <span style={{ display: 'flex', gap: '1rem' }}>
          <a href={collectionHref}>Per-row edit (collection)</a>
          <a href={exportHref}>엑셀다운로드 (Export CSV)</a>
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>번호</th>
              <th style={cell}>테이블구분</th>
              <th style={cell}>테이블명</th>
              <th style={cell}>테이블설명</th>
              <th style={cell}>표준출처</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.length === 0 ? (
              <tr>
                <td style={cell} colSpan={5}>
                  No tables match your filter.
                </td>
              </tr>
            ) : (
              result.rows.map((r, i) => (
                <tr key={r.tableName}>
                  <td style={cell}>{i + 1}</td>
                  <td style={cell}>{r.tableCategory}</td>
                  <td style={cell}>{r.tableName}</td>
                  <td style={cell}>{r.tableDescription}</td>
                  <td style={cell}>{SOURCE_LABEL.get(r.standardSource) ?? r.standardSource}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
