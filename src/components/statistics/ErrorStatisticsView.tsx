import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import {
  type DrillDimension,
  type ErrorStatsPayload,
  filterByBucket,
  type StatsGranularity,
} from '@/content/errorStats'
import { ERROR_LOGS_MENU_KEY } from '@/endpoints/errorStatsExport'
import { maskLabel } from '@/lib/mask'
import { buildErrorStats, loadErrorRows } from '@/site/errorStatsData'

/**
 * Error statistics admin view (Task 5C; refs 1-58/1-59). A custom top-level admin
 * view at `/admin/error-statistics`, registered in payload.config.ts and linked
 * from the nav (StatisticsNavLink). SERVER component: reads the caller from
 * `initPageResult.req`, GATES on `system.errorLogs`, and renders the three stat
 * tabs (by PERIOD / by TYPE / by URL) as a count table + lightweight CSS bars.
 * Clicking a bucket DRILLS DOWN to the matching (filtered) error list below.
 *
 * Deliberately minimal + no chart library (table + basic bars): all controls are
 * no-JS GET forms/links, and the data comes from the shared `errorStatsData`
 * helpers — the SAME source the export endpoint uses, so the view + CSV +
 * drill-down never diverge. Reads with `overrideAccess: true` because THIS view's
 * own gate already authorized the caller (errorLogs is a global store).
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

const TABS = [
  { key: 'period', label: 'By period' },
  { key: 'type', label: 'By type' },
  { key: 'url', label: 'By URL' },
] as const
type TabKey = (typeof TABS)[number]['key']

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1100, margin: '0 auto' }
const barTrack: React.CSSProperties = {
  background: 'var(--theme-elevation-100, #eee)',
  borderRadius: 3,
  height: 10,
  minWidth: 40,
  overflow: 'hidden',
}
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
  verticalAlign: 'top',
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export async function ErrorStatisticsView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Error Statistics</h1>
        <p>You must be signed in to view error statistics.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, ERROR_LOGS_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Error Statistics</h1>
        <p>You do not have permission to view error statistics (requires System · Error Log).</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const granularity: StatsGranularity =
    firstParam(sp.granularity) === 'monthly' ? 'monthly' : 'daily'
  const nowMs = new Date().getTime()
  const today = utcDay(nowMs)
  const defaultFrom = utcDay(nowMs - 29 * 86_400_000)
  const fromRaw = firstParam(sp.from)
  const toRaw = firstParam(sp.to)
  const from = fromRaw && DATE_RE.test(fromRaw) ? fromRaw : defaultFrom
  const to = toRaw && DATE_RE.test(toRaw) ? toRaw : today
  const tab: TabKey = (TABS.find((t) => t.key === firstParam(sp.tab))?.key ?? 'period') as TabKey

  const drillDimRaw = firstParam(sp.drillDim)
  const drillDim: DrillDimension | null =
    drillDimRaw === 'period' || drillDimRaw === 'type' || drillDimRaw === 'url' ? drillDimRaw : null
  const drillValue = firstParam(sp.drillValue)

  const rows = await loadErrorRows(payload, { from, to, req: req as PayloadRequest })
  const stats = buildErrorStats(rows, { from, to, granularity })

  const q = (overrides: Record<string, string>): string => {
    const params = new URLSearchParams({ from, to, granularity, tab, ...overrides })
    return params.toString()
  }
  const exportHref = `/api/errorLogs/stats/export?${q({ tab })}`
  // A variable (not a literal page path), so the next/link rule doesn't apply —
  // this is a Payload admin route served by Payload's catch-all; a hard anchor
  // navigation reliably re-renders the server list view (same as StatisticsNavLink).
  const errorLogListHref = '/admin/collections/errorLogs'

  const drillRows =
    drillDim && drillValue ? filterByBucket(rows, drillDim, drillValue, granularity) : null

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Error Statistics</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Captured unhandled exceptions (HTTP 500+) by period, exception type and URL. Messages and
        stacks are sanitized (no secrets/PII stored). Click a row to drill down to its errors.
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
        <input type="hidden" name="tab" value={tab} />
        <label>
          <div>From</div>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          <div>To</div>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label>
          <div>Granularity</div>
          <select name="granularity" defaultValue={granularity}>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      {/* Headline total */}
      <div style={{ margin: '1rem 0' }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.total.toLocaleString()}</div>
        <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Total errors in range</div>
      </div>

      {/* Tab nav */}
      <nav
        style={{
          display: 'flex',
          gap: '.5rem',
          borderBottom: '2px solid var(--theme-elevation-100, #eee)',
          marginBottom: '1rem',
        }}
      >
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`?${q({ tab: t.key })}`}
            style={{
              padding: '.5rem .9rem',
              textDecoration: 'none',
              fontWeight: t.key === tab ? 700 : 400,
              borderBottom:
                t.key === tab
                  ? '2px solid var(--theme-error-500, #c62828)'
                  : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <div
        style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem', gap: '1rem' }}
      >
        <a href={errorLogListHref}>Open full error log</a>
        <a href={exportHref}>Export CSV (Excel)</a>
      </div>

      <TabContent
        tab={tab}
        stats={stats}
        buildDrillHref={(dim, value) => `?${q({ drillDim: dim, drillValue: value })}`}
      />

      {drillDim && drillValue ? (
        <DrillDown
          dimension={drillDim}
          value={drillValue}
          rows={drillRows ?? []}
          clearHref={`?${q({})}`}
        />
      ) : null}
    </div>
  )
}

function Bars({
  rows,
  buildHref,
}: {
  rows: { key: string; count: number }[]
  buildHref: (value: string) => string
}): React.ReactElement {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={cell}>Bucket</th>
          <th style={cell}>Errors</th>
          <th style={{ ...cell, textAlign: 'right' }}>Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td style={cell} colSpan={3}>
              No errors in this range.
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.key}>
              <td style={cell}>
                <a href={buildHref(r.key)}>{r.key}</a>
              </td>
              <td style={{ ...cell, width: 260 }}>
                <div style={barTrack}>
                  <div
                    style={{
                      width: `${Math.round((r.count / max) * 100)}%`,
                      height: '100%',
                      background: 'var(--theme-error-500, #c62828)',
                    }}
                  />
                </div>
              </td>
              <td style={{ ...cell, textAlign: 'right' }}>{r.count.toLocaleString()}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function TabContent({
  tab,
  stats,
  buildDrillHref,
}: {
  tab: TabKey
  stats: ErrorStatsPayload
  buildDrillHref: (dim: DrillDimension, value: string) => string
}): React.ReactElement {
  if (tab === 'period') {
    return (
      <Bars
        rows={stats.period.map((p) => ({ key: p.period, count: p.count }))}
        buildHref={(value) => buildDrillHref('period', value)}
      />
    )
  }
  if (tab === 'type') {
    return <Bars rows={stats.type} buildHref={(value) => buildDrillHref('type', value)} />
  }
  return <Bars rows={stats.url} buildHref={(value) => buildDrillHref('url', value)} />
}

function DrillDown({
  dimension,
  value,
  rows,
  clearHref,
}: {
  dimension: DrillDimension
  value: string
  rows: import('@/content/errorStats').ErrorRow[]
  clearHref: string
}): React.ReactElement {
  const label = dimension === 'type' ? 'exception class' : dimension === 'url' ? 'URL' : 'period'
  return (
    <section style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ marginBottom: '.25rem' }}>
          Errors for {label} “{value}” ({rows.length.toLocaleString()})
        </h2>
        <a href={clearHref}>Clear drill-down</a>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>When</th>
            <th style={cell}>Class</th>
            <th style={cell}>Status</th>
            <th style={cell}>URL</th>
            <th style={cell}>Actor</th>
            <th style={cell}>Message</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td style={cell} colSpan={6}>
                No matching errors.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={`${r.occurredAt ?? ''}-${i}`}>
                <td style={cell}>{r.occurredAt ?? ''}</td>
                <td style={cell}>{r.exceptionClass ?? ''}</td>
                <td style={cell}>{r.statusCode ?? ''}</td>
                <td style={cell}>{r.url ?? ''}</td>
                <td style={cell}>{r.actorLabel ? maskLabel(r.actorLabel) : ''}</td>
                <td style={{ ...cell, maxWidth: 360, overflowWrap: 'anywhere' }}>
                  {r.message ?? ''}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}
