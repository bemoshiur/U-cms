import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { SELF_CHECK_ERROR_TYPES, STD_SELF_CHECK_STATS_MENU_KEY } from '@/standardization/constants'
import type { RuleId } from '@/standardization/rules'
import { formatYearMonth } from '@/standardization/yearMonth'
import { buildSelfCheckStats, loadSelfCheckSnapshots } from '@/site/standardizationStats'

/**
 * Self-Check Statistics view (Phase 8, Task 8.1b; ref 1-76). An error-type
 * distribution pie, a monthly trend (per error type), and a per-year-month table
 * over the stored self-check snapshots — filterable by source + YYYYMM range,
 * with CSV export. Reuses the Phase-5 insights approach: a shared loader feeds
 * both this view and the export. Gated on `standardization.selfCheckStats`.
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
/** Eight-slot categorical palette (brand-neutral, distinct in light + dark). */
const PALETTE = [
  '#4e79a7',
  '#f28e2b',
  '#59a14f',
  '#e15759',
  '#af7aa1',
  '#76b7b2',
  '#edc948',
  '#9c755f',
]

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1100, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
}

/** Builds SVG pie slice paths from the distribution. */
function pieSlices(
  data: { errorType: RuleId; total: number }[],
): { path: string; color: string; label: string }[] {
  const total = data.reduce((s, d) => s + d.total, 0)
  if (total <= 0) return []
  const cx = 90
  const cy = 90
  const r = 85
  let angle = -Math.PI / 2
  const slices: { path: string; color: string; label: string }[] = []
  data.forEach((d, i) => {
    if (d.total <= 0) return
    const frac = d.total / total
    const next = angle + frac * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(next)
    const y2 = cy + r * Math.sin(next)
    const large = frac > 0.5 ? 1 : 0
    slices.push({
      path: `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`,
      color: PALETTE[i % PALETTE.length] ?? '#888',
      label: ERROR_LABEL.get(d.errorType) ?? d.errorType,
    })
    angle = next
  })
  return slices
}

export async function SelfCheckStatisticsView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Self-Check Statistics</h1>
        <p>You must be signed in.</p>
      </div>
    )
  }
  if (!(await hasMenuAccess(req as PayloadRequest, STD_SELF_CHECK_STATS_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Self-Check Statistics (표준화 자가점검 통계)</h1>
        <p>You do not have permission (requires the DBA · Self-Check Statistics grant).</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const source = firstParam(sp.source)?.trim() || undefined
  const fromYm = firstParam(sp.fromYm)?.trim() || undefined
  const toYm = firstParam(sp.toYm)?.trim() || undefined

  const rows = await loadSelfCheckSnapshots(payload, {
    query: { source, fromYm, toYm },
    req: req as PayloadRequest,
  })
  const stats = buildSelfCheckStats(rows)
  const slices = pieSlices(stats.pie)

  const q = new URLSearchParams()
  if (source) q.set('source', source)
  if (fromYm) q.set('fromYm', fromYm)
  if (toYm) q.set('toYm', toYm)
  const exportHref = `/api/standardizationSelfChecks/statistics/export${q.toString() ? `?${q}` : ''}`

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Self-Check Statistics (표준화 자가점검 통계)</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Error-type distribution and monthly trend over the stored self-check snapshots.
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
          <select name="source" defaultValue={source ?? ''}>
            <option value="">전체 (All)</option>
            <option value="mois">행정안전부 (MOIS)</option>
            <option value="institution">기관 (Institution)</option>
          </select>
        </label>
        <label>
          <div>From (YYYYMM)</div>
          <input
            name="fromYm"
            defaultValue={fromYm ?? ''}
            placeholder="202601"
            style={{ width: 100 }}
          />
        </label>
        <label>
          <div>To (YYYYMM)</div>
          <input
            name="toYm"
            defaultValue={toYm ?? ''}
            placeholder="202612"
            style={{ width: 100 }}
          />
        </label>
        <button type="submit">통계보기 (View statistics)</button>
        <a href={exportHref}>엑셀 다운로드 (Export CSV)</a>
      </form>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', margin: '1.5rem 0' }}>
        {/* Pie — error-type distribution */}
        <div>
          <h3>오류 분포 (Distribution)</h3>
          {slices.length === 0 ? (
            <p style={{ color: 'var(--theme-elevation-500, #888)' }}>No data in range.</p>
          ) : (
            <svg
              width={180}
              height={180}
              viewBox="0 0 180 180"
              role="img"
              aria-label="Error distribution pie"
            >
              {slices.map((s, i) => (
                <path
                  key={i}
                  d={s.path}
                  fill={s.color}
                  stroke="var(--theme-bg, #fff)"
                  strokeWidth={1}
                />
              ))}
            </svg>
          )}
        </div>
        {/* Legend + totals */}
        <div>
          <h3>범례 (Legend) · 총 {stats.grandTotal.toLocaleString()}건</h3>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {stats.pie.map((p, i) => (
                <tr key={p.errorType}>
                  <td style={{ ...cell, width: 18 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 12,
                        background: PALETTE[i % PALETTE.length],
                      }}
                    />
                  </td>
                  <td style={cell}>{p.label}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{p.total.toLocaleString()}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>{p.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly trend (per error type) */}
      <h3>월별 추이 (Monthly trend)</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={cell}>오류 \ 연월</th>
              {stats.trend.months.map((m) => (
                <th key={m} style={cell}>
                  {formatYearMonth(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.trend.series.map((s) => (
              <tr key={s.errorType}>
                <td style={cell}>{s.label}</td>
                {s.counts.map((c, i) => (
                  <td key={i} style={cell}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-year-month table */}
      <h3 style={{ marginTop: '1.5rem' }}>연월별 통계 (Per year-month)</h3>
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
            {stats.table.length === 0 ? (
              <tr>
                <td style={cell} colSpan={3 + ERROR_IDS.length}>
                  No snapshots in range.
                </td>
              </tr>
            ) : (
              stats.table.map((r) => (
                <tr key={`${r.checkYearMonth}-${r.standardSource}`}>
                  <td style={cell}>{formatYearMonth(r.checkYearMonth)}</td>
                  <td style={cell}>{r.standardSource === 'mois' ? '행정안전부' : '기관'}</td>
                  {ERROR_IDS.map((id) => (
                    <td key={id} style={cell}>
                      {r.counts[id] ?? 0}
                    </td>
                  ))}
                  <td style={cell}>{r.checkedAt ? r.checkedAt.slice(0, 10) : ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
