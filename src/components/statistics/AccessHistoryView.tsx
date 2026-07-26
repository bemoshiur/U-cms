import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess } from '@/access/hasMenuAccess'
import { ACCESS_HISTORY_MENU_KEY, loadAccessHistory } from '@/site/accessHistoryData'

/**
 * Site access-history admin view (Task 5C Part 2; ref 2-20). A custom top-level
 * admin view at `/admin/access-history`, registered in payload.config.ts and
 * linked from the nav. SERVER component: reads the caller from
 * `initPageResult.req`, GATES on `privacy.accessLogs`, and renders a masked,
 * date+keyword-searchable, paginated table over the EXISTING `accessLogs` — who
 * accessed what, when, from where (masked). This is a VIEW/query over the Phase-2
 * audit backbone, not new capture. Reads with `overrideAccess: true` because THIS
 * view's own gate already authorized the caller.
 *
 * Scope: the SYSTEM-WIDE admin back-office access history (accessLogs carry no
 * per-site dimension) — see `src/site/accessHistoryData.ts` for the full rationale.
 * All controls are no-JS GET forms/links; the data + masking come from the shared
 * `accessHistoryData` helper (the SAME source the CSV export uses).
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1100, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
  verticalAlign: 'top',
}

export async function AccessHistoryView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Access History</h1>
        <p>You must be signed in to view access history.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, ACCESS_HISTORY_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Access History</h1>
        <p>
          You do not have permission to view access history (requires Privacy · Access History).
        </p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const fromRaw = firstParam(sp.from)
  const toRaw = firstParam(sp.to)
  const from = fromRaw && DATE_RE.test(fromRaw) ? fromRaw : undefined
  const to = toRaw && DATE_RE.test(toRaw) ? toRaw : undefined
  const keyword = firstParam(sp.keyword)?.trim() || undefined
  const pageRaw = Number(firstParam(sp.page))
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1

  const result = await loadAccessHistory(payload, {
    query: { from, to, keyword, page },
    req: req as PayloadRequest,
    overrideAccess: true,
  })

  const q = (overrides: Record<string, string>): string => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (keyword) params.set('keyword', keyword)
    for (const [k, v] of Object.entries(overrides)) {
      params.set(k, v)
    }
    return params.toString()
  }
  const exportHref = `/api/accessLogs/history/export${keyword || from || to ? `?${q({})}` : ''}`

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Access History</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Admin back-office access history — who accessed what, when, and from where. Actor and IP are
        masked; the real values are retained in the audit log for non-repudiation.
      </p>

      {/* Controls — no-JS GET form (resets to page 1 on a new search) */}
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
          <div>From</div>
          <input type="date" name="from" defaultValue={from ?? ''} />
        </label>
        <label>
          <div>To</div>
          <input type="date" name="to" defaultValue={to ?? ''} />
        </label>
        <label style={{ flex: '1 1 240px' }}>
          <div>Keyword (actor / URL / IP / menu)</div>
          <input
            type="search"
            name="keyword"
            defaultValue={keyword ?? ''}
            placeholder="e.g. login, /admin, 203.0.113"
            style={{ width: '100%' }}
          />
        </label>
        <button type="submit">Search</button>
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
          {result.total.toLocaleString()} record{result.total === 1 ? '' : 's'} · page {result.page}{' '}
          of {result.totalPages}
        </span>
        <a href={exportHref}>Export CSV (Excel)</a>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>When</th>
            <th style={cell}>Actor</th>
            <th style={cell}>Action</th>
            <th style={cell}>Menu</th>
            <th style={cell}>URL</th>
            <th style={cell}>IP</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 ? (
            <tr>
              <td style={cell} colSpan={6}>
                No access records match your search.
              </td>
            </tr>
          ) : (
            result.rows.map((r) => (
              <tr key={String(r.id)}>
                <td style={cell}>{r.createdAt ?? ''}</td>
                <td style={cell}>{r.actorLabelMasked}</td>
                <td style={cell}>{r.action ?? ''}</td>
                <td style={cell}>{r.menuLabel ?? ''}</td>
                <td style={{ ...cell, maxWidth: 320, overflowWrap: 'anywhere' }}>{r.url ?? ''}</td>
                <td style={cell}>{r.ipAddressMasked}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Pagination */}
      <nav style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
        {result.page > 1 ? (
          <a href={`?${q({ page: String(result.page - 1) })}`}>← Previous</a>
        ) : (
          <span style={{ color: 'var(--theme-elevation-300, #bbb)' }}>← Previous</span>
        )}
        {result.page < result.totalPages ? (
          <a href={`?${q({ page: String(result.page + 1) })}`}>Next →</a>
        ) : (
          <span style={{ color: 'var(--theme-elevation-300, #bbb)' }}>Next →</span>
        )}
      </nav>
    </div>
  )
}
