import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { loadSelfCheckList } from '@/endpoints/standardizationEngineExport'
import { SELF_CHECK_ERROR_TYPES, STD_SELF_CHECK_MENU_KEY } from '@/standardization/constants'
import type { RuleId } from '@/standardization/rules'
import { formatYearMonth } from '@/standardization/yearMonth'
import { RunCheckButton } from './RunCheckButton'

/**
 * Standardization Self-Check Results view (Phase 8, Task 8.1b; ref 1-75). Lists
 * one snapshot per (점검연월, 표준출처) with the eight error counts (non-zero counts
 * link to the detail popup below), a "표준화 점검 / Run Check" action that recomputes
 * the CURRENT month, and CSV export at summary + detail level. Detail rows load
 * when `?ym=&source=` is set. Gated on `standardization.selfCheck`.
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const ERROR_IDS = SELF_CHECK_ERROR_TYPES.map((e) => e.id) as RuleId[]
const ERROR_LABEL = new Map(SELF_CHECK_ERROR_TYPES.map((e) => [e.id, e.label]))

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1280, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
}

type Detail = {
  tableName: string
  columnName: string
  logicalName: string
  dataType: string
  domain: string
  errorTypes: RuleId[]
}

export async function SelfCheckView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Standardization Self-Check</h1>
        <p>You must be signed in.</p>
      </div>
    )
  }
  if (!(await hasMenuAccess(req as PayloadRequest, STD_SELF_CHECK_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Standardization Self-Check (표준화 자가점검 결과)</h1>
        <p>You do not have permission (requires the DBA · Self-Check grant).</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const source = firstParam(sp.source)?.trim() || undefined
  const detailYm = firstParam(sp.ym)?.trim() || undefined
  const detailSource = firstParam(sp.detailSource)?.trim() || undefined
  const detailErrorType = firstParam(sp.errorType)?.trim() || undefined

  const list = await loadSelfCheckList(payload, { source, req: req as PayloadRequest })

  // Detail rows (denormalized on the snapshot) for the selected count.
  let detail: Detail[] = []
  if (detailYm && detailSource) {
    const snap = list.snapshots.find(
      (s) => s.checkYearMonth === detailYm && s.standardSource === detailSource,
    )
    if (snap) {
      const res = await payload.find({
        collection: 'standardizationSelfChecks',
        where: {
          and: [
            { checkYearMonth: { equals: detailYm } },
            { standardSource: { equals: detailSource } },
          ],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
        req: req as PayloadRequest,
      })
      const raw = res.docs[0] ? (res.docs[0] as { details?: unknown }).details : undefined
      const all = Array.isArray(raw) ? (raw as Detail[]) : []
      detail = detailErrorType
        ? all.filter(
            (d) => Array.isArray(d.errorTypes) && d.errorTypes.includes(detailErrorType as RuleId),
          )
        : all
    }
  }

  const summaryExport = `/api/standardizationSelfChecks/self-check/export${source ? `?source=${source}` : ''}`

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Standardization Self-Check (표준화 자가점검 결과)</h1>
      <p style={{ color: 'var(--theme-error-500, #c62828)', marginTop: 0 }}>
        Running the check recomputes the CURRENT year-month; 해당년월 이전의 내용은 참고용으로만
        사용한다 (earlier months are reference-only).
      </p>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          alignItems: 'end',
          margin: '1rem 0',
        }}
      >
        <form method="get" style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
          <label>
            <div>표준출처 (Source)</div>
            <select name="source" defaultValue={source ?? ''}>
              <option value="">전체 (All)</option>
              <option value="mois">행정안전부 (MOIS)</option>
              <option value="institution">기관 (Institution)</option>
            </select>
          </label>
          <button type="submit">검색 (Search)</button>
        </form>
        <RunCheckButton />
        <a href={summaryExport}>전체엑셀다운로드 (Export CSV)</a>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>점검연월</th>
              <th style={cell}>표준출처</th>
              {ERROR_IDS.map((id) => (
                <th key={id} style={cell}>
                  {ERROR_LABEL.get(id)}
                </th>
              ))}
              <th style={cell}>점검일</th>
            </tr>
          </thead>
          <tbody>
            {list.snapshots.length === 0 ? (
              <tr>
                <td style={cell} colSpan={3 + ERROR_IDS.length}>
                  No self-check snapshots yet — run a check to create the current month.
                </td>
              </tr>
            ) : (
              list.snapshots.map((s) => (
                <tr key={`${s.checkYearMonth}-${s.standardSource}`}>
                  <td style={cell}>{formatYearMonth(s.checkYearMonth)}</td>
                  <td style={cell}>{s.standardSource === 'mois' ? '행정안전부' : '기관'}</td>
                  {ERROR_IDS.map((id) => {
                    const n = s.counts[id] ?? 0
                    return (
                      <td key={id} style={cell}>
                        {n > 0 ? (
                          <a
                            href={`?source=${source ?? ''}&ym=${s.checkYearMonth}&detailSource=${s.standardSource}&errorType=${id}`}
                            style={{ color: 'var(--theme-error-500, #c62828)', fontWeight: 600 }}
                          >
                            {n}
                          </a>
                        ) : (
                          0
                        )}
                      </td>
                    )
                  })}
                  <td style={cell}>
                    {s.checkedAt ? s.checkedAt.slice(0, 19).replace('T', ' ') : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detailYm && detailSource ? (
        <section style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ marginBottom: '.25rem' }}>
              오류 상세 — {formatYearMonth(detailYm)} / {detailSource}
              {detailErrorType ? ` / ${ERROR_LABEL.get(detailErrorType as RuleId)}` : ''} (
              {detail.length.toLocaleString()})
            </h2>
            <span style={{ display: 'flex', gap: '1rem' }}>
              <a
                href={`/api/standardizationSelfChecks/self-check/export?ym=${detailYm}&source=${detailSource}${detailErrorType ? `&errorType=${detailErrorType}` : ''}`}
              >
                엑셀다운로드 (Export CSV)
              </a>
              <a href={`?source=${source ?? ''}`}>Clear</a>
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={cell}>테이블명</th>
                  <th style={cell}>컬럼명</th>
                  <th style={cell}>용어명</th>
                  <th style={cell}>데이터타입</th>
                  <th style={cell}>도메인명</th>
                  <th style={cell}>오류</th>
                </tr>
              </thead>
              <tbody>
                {detail.length === 0 ? (
                  <tr>
                    <td style={cell} colSpan={6}>
                      No detail rows.
                    </td>
                  </tr>
                ) : (
                  detail.slice(0, 500).map((d, i) => (
                    <tr key={`${d.tableName}-${d.columnName}-${i}`}>
                      <td style={cell}>{d.tableName}</td>
                      <td style={cell}>{d.columnName}</td>
                      <td style={cell}>{d.logicalName}</td>
                      <td style={cell}>{d.dataType}</td>
                      <td style={cell}>{d.domain}</td>
                      <td style={cell}>
                        {(d.errorTypes ?? []).map((id) => ERROR_LABEL.get(id) ?? id).join(' ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
