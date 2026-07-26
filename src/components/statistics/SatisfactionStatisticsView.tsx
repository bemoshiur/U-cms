import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess, isSuperUser } from '@/access/hasMenuAccess'
import { getAssignedTenantIds } from '@/access/tenantAccess'
import { SATISFACTION_LEVELS } from '@/content/satisfaction'
import { SATISFACTION_MENU_KEY } from '@/endpoints/satisfactionStatsExport'
import {
  buildSatisfactionStatsPayload,
  loadSatisfactionRatings,
  loadSiteMenus,
} from '@/site/satisfactionStatsData'

/**
 * Satisfaction statistics admin view (Task 5B; TODO 5.4, ref 2-19). A custom
 * top-level admin view at `/admin/satisfaction-statistics`, registered in
 * payload.config.ts and linked from the nav (StatisticsNavLink). SERVER
 * component: it reads the caller from `initPageResult.req`, GATES on
 * `statistics.satisfaction`, scopes the per-site selector to the caller's
 * assigned sites, and renders the DEPARTMENT → MENU cascading filters, the score
 * distribution table (count + % per 1-5 score) with a weighted average, and the
 * per-menu average bars, with a CSV export link to
 * `/api/satisfactionRatings/stats/export`.
 *
 * Deliberately minimal + no chart library (a table + basic bars): all controls
 * are no-JS GET forms/links, and the data comes from the shared
 * `satisfactionStatsData` helpers (the SAME source the export endpoint uses, so
 * the view and CSV never diverge). Reads with `overrideAccess: true` because
 * THIS view's own gate has already authorized the caller + constrained the site.
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const KOREAN_BY_SCORE = new Map(SATISFACTION_LEVELS.map((l) => [l.score, l]))

const wrap: React.CSSProperties = { padding: '2rem', maxWidth: 1100, margin: '0 auto' }
const cell: React.CSSProperties = {
  padding: '.4rem .6rem',
  borderBottom: '1px solid var(--theme-elevation-100, #eee)',
  textAlign: 'left',
}
const barTrack: React.CSSProperties = {
  background: 'var(--theme-elevation-100, #eee)',
  borderRadius: 3,
  height: 10,
  minWidth: 40,
  overflow: 'hidden',
}

export async function SatisfactionStatisticsView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Satisfaction Statistics</h1>
        <p>You must be signed in to view satisfaction statistics.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, SATISFACTION_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Satisfaction Statistics</h1>
        <p>
          You do not have permission to view satisfaction statistics (requires Site Statistics ·
          Satisfaction).
        </p>
      </div>
    )
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

  if (siteOptions.length === 0) {
    return (
      <div style={wrap}>
        <h1>Satisfaction Statistics</h1>
        <p>No sites are assigned to your account.</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const requestedSite = firstParam(sp.site)
  const firstSite = siteOptions[0]!
  const selectedSite =
    siteOptions.find((s) => String(s.id) === String(requestedSite))?.id ?? firstSite.id
  const departmentId = firstParam(sp.department) || null
  const menuIdRaw = firstParam(sp.menu) || null

  const [ratings, menus] = await Promise.all([
    loadSatisfactionRatings(payload, { tenantId: selectedSite, overrideAccess: true }),
    loadSiteMenus(payload, selectedSite),
  ])

  // If the chosen menu is not in the chosen department's menu set, drop it (keeps
  // the cascade coherent when the department changes).
  const deptMenuIds = new Set(
    (departmentId === null
      ? menus
      : menus.filter((m) => String(m.departmentId) === String(departmentId))
    ).map((m) => String(m.id)),
  )
  const menuId = menuIdRaw !== null && deptMenuIds.has(menuIdRaw) ? menuIdRaw : null

  const stats = buildSatisfactionStatsPayload({ ratings, menus, departmentId, menuId })

  const q = (overrides: Record<string, string>): string => {
    const params = new URLSearchParams({ site: String(selectedSite) })
    if (departmentId) params.set('department', departmentId)
    if (menuId) params.set('menu', menuId)
    for (const [k, v] of Object.entries(overrides)) {
      if (v === '') {
        params.delete(k)
      } else {
        params.set(k, v)
      }
    }
    return params.toString()
  }
  const exportHref = `/api/satisfactionRatings/stats/export?${q({})}`
  const maxMenu = Math.max(1, ...stats.byMenu.map((m) => m.average ?? 0))
  const maxDistCount = Math.max(1, ...stats.distribution.map((b) => b.count))

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Satisfaction Statistics</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        5-point satisfaction (1–5) by page/menu and department. Distribution with weighting, a
        weighted average, and per-menu averages.
      </p>

      {/* Controls — no-JS GET form. Changing the site/department resubmits and
          re-scopes the (dependent) menu options. */}
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
          <div>Site</div>
          <select name="site" defaultValue={String(selectedSite)}>
            {siteOptions.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {typeof s.name === 'string' ? s.name : String(s.siteId ?? s.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div>Department</div>
          <select name="department" defaultValue={departmentId ?? ''}>
            <option value="">All departments</option>
            {stats.departments.map((d) => (
              <option key={String(d.id)} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <div>Menu</div>
          <select name="menu" defaultValue={menuId ?? ''}>
            <option value="">All menus</option>
            {stats.menus.map((m) => (
              <option key={String(m.id)} value={String(m.id)}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      {/* Headline totals */}
      <div style={{ display: 'flex', gap: '2rem', margin: '1rem 0' }}>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.count.toLocaleString()}</div>
          <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Ratings</div>
        </div>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{stats.weightedAverage ?? '—'}</div>
          <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Weighted average (1–5)</div>
        </div>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
            {stats.percent === null ? '—' : `${stats.percent}%`}
          </div>
          <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Satisfaction %</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}>
        <a href={exportHref}>Export CSV (Excel)</a>
      </div>

      {/* Distribution table (count + % per score) */}
      <h2 style={{ fontSize: '1.1rem' }}>Score distribution</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th style={cell}>Score</th>
            <th style={cell}>Share</th>
            <th style={{ ...cell, textAlign: 'right' }}>Count</th>
            <th style={{ ...cell, textAlign: 'right' }}>Percentage</th>
          </tr>
        </thead>
        <tbody>
          {stats.distribution.map((b) => {
            const level = KOREAN_BY_SCORE.get(b.score)
            return (
              <tr key={b.score}>
                <td style={cell}>
                  {b.score} {level ? `· ${level.label} (${level.korean})` : ''}
                </td>
                <td style={{ ...cell, width: 240 }}>
                  <div style={barTrack}>
                    <div
                      style={{
                        width: `${Math.round((b.count / maxDistCount) * 100)}%`,
                        height: '100%',
                        background: 'var(--theme-success-500, #2e7d32)',
                      }}
                    />
                  </div>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>{b.count.toLocaleString()}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{b.percentage}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Per-menu averages (bars) */}
      <h2 style={{ fontSize: '1.1rem' }}>Average score per menu</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>Menu</th>
            <th style={cell}>Average (1–5)</th>
            <th style={{ ...cell, textAlign: 'right' }}>Ratings</th>
            <th style={{ ...cell, textAlign: 'right' }}>Satisfaction %</th>
          </tr>
        </thead>
        <tbody>
          {stats.byMenu.length === 0 ? (
            <tr>
              <td style={cell} colSpan={4}>
                No ratings in this scope.
              </td>
            </tr>
          ) : (
            stats.byMenu.map((m) => (
              <tr key={String(m.menuId ?? 'null')}>
                <td style={cell}>{m.menuName}</td>
                <td style={{ ...cell, width: 260 }}>
                  <div style={barTrack}>
                    <div
                      style={{
                        width: `${Math.round(((m.average ?? 0) / maxMenu) * 100)}%`,
                        height: '100%',
                        background: 'var(--theme-success-500, #2e7d32)',
                      }}
                    />
                  </div>
                  <span style={{ marginLeft: 8 }}>{m.average ?? '—'}</span>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>{m.count.toLocaleString()}</td>
                <td style={{ ...cell, textAlign: 'right' }}>
                  {m.percent === null ? '—' : `${m.percent}%`}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
