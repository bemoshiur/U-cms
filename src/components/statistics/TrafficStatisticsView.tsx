import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess, isSuperUser } from '@/access/hasMenuAccess'
import { getAssignedTenantIds } from '@/access/tenantAccess'
import { withPercentages } from '@/content/trafficStats'
import { TRAFFIC_DAILY_MENU_KEY } from '@/endpoints/trafficExport'
import { loadDailyRollups, buildStatsPayload, type StatsGranularity } from '@/site/trafficStatsData'
import { utcDayString } from '@/site/trafficAggregation'

/**
 * Traffic statistics admin view (Task 5A; TODO 5.2, refs 1-54 / 2-17). A custom
 * top-level admin view at `/admin/traffic-statistics`, registered in
 * payload.config.ts and linked from the nav (StatisticsNavLink). SERVER
 * component: it reads the caller from `initPageResult.req`, GATES on
 * `statistics.traffic`, scopes the per-site selector to the caller's assigned
 * sites, and renders the five tabs (period / menu / OS / browser / device) as a
 * table + lightweight CSS bars, each with a CSV export link to the
 * `/api/trafficDaily/stats/export` endpoint.
 *
 * Deliberately minimal + no chart library (the brief: "a table + basic bars is
 * acceptable"): all controls are no-JS GET forms/links, and the data comes from
 * the compact `trafficDaily` rollups via the shared `trafficStatsData` helpers
 * (the SAME source the export endpoints use, so the view and CSV never diverge).
 * Reads with `overrideAccess: true` because THIS view's own gate has already
 * authorized the caller + constrained the site list to their tenants.
 */

type ViewProps = {
  initPageResult?: { req?: PayloadRequest }
  searchParams?: Record<string, string | string[] | undefined>
}

const TABS = [
  { key: 'period', label: 'Period' },
  { key: 'menu', label: 'Menu/Page' },
  { key: 'os', label: 'OS' },
  { key: 'browser', label: 'Browser' },
  { key: 'device', label: 'Device' },
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
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <tr>
      <td style={cell}>{label}</td>
      <td style={{ ...cell, width: 220 }}>
        <div style={barTrack}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--theme-success-500, #2e7d32)',
            }}
          />
        </div>
      </td>
      <td style={{ ...cell, textAlign: 'right', width: 90 }}>{value.toLocaleString()}</td>
    </tr>
  )
}

export async function TrafficStatisticsView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Traffic Statistics</h1>
        <p>You must be signed in to view traffic statistics.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, TRAFFIC_DAILY_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Traffic Statistics</h1>
        <p>
          You do not have permission to view traffic statistics (requires Site Statistics ·
          Traffic).
        </p>
      </div>
    )
  }

  // Site selector — scoped to the caller's assigned sites (super sees all).
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
        <h1>Traffic Statistics</h1>
        <p>No sites are assigned to your account.</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const requestedSite = firstParam(sp.site)
  const firstSite = siteOptions[0]!
  const selectedSite =
    siteOptions.find((s) => String(s.id) === String(requestedSite))?.id ?? firstSite.id
  const granularity: StatsGranularity =
    firstParam(sp.granularity) === 'monthly' ? 'monthly' : 'daily'
  const nowMs = new Date().getTime()
  const today = utcDayString(new Date(nowMs))
  const defaultFrom = utcDayString(new Date(nowMs - 29 * 86_400_000))
  const fromRaw = firstParam(sp.from)
  const toRaw = firstParam(sp.to)
  const from = fromRaw && DATE_RE.test(fromRaw) ? fromRaw : defaultFrom
  const to = toRaw && DATE_RE.test(toRaw) ? toRaw : today
  const tabRaw = firstParam(sp.tab)
  const tab: TabKey = (TABS.find((t) => t.key === tabRaw)?.key ?? 'period') as TabKey

  const dailies = await loadDailyRollups(payload, {
    tenantId: selectedSite,
    from,
    to,
    overrideAccess: true,
  })
  const stats = buildStatsPayload(dailies, { from, to, granularity })

  // Resolve menu names for /page/{n} rows on the Menu/Page tab (bounded lookup).
  const menuNameByNumber = new Map<number, string>()
  if (tab === 'menu') {
    const menus = await payload.find({
      collection: 'menus',
      where: { tenant: { equals: selectedSite } } as never,
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    for (const m of menus.docs as { menuNumber?: unknown; name?: unknown }[]) {
      if (typeof m.menuNumber === 'number' && typeof m.name === 'string') {
        menuNameByNumber.set(m.menuNumber, m.name)
      }
    }
  }

  const q = (overrides: Record<string, string>): string => {
    const params = new URLSearchParams({
      site: String(selectedSite),
      from,
      to,
      granularity,
      tab,
      ...overrides,
    })
    return params.toString()
  }
  const exportHref = `/api/trafficDaily/stats/export?${q({ tab })}`

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Traffic Statistics</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Aggregated page views by period, menu/page, OS, browser and device. Data is privacy-safe (no
        IP/UA stored) and computed from daily rollups.
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

      {/* Headline totals */}
      <div style={{ display: 'flex', gap: '2rem', margin: '1rem 0' }}>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
            {stats.totalViews.toLocaleString()}
          </div>
          <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Total page views</div>
        </div>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
            {stats.uniqueVisitors.toLocaleString()}
          </div>
          <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Unique visitors</div>
        </div>
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
                  ? '2px solid var(--theme-success-500, #2e7d32)'
                  : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}>
        <a href={exportHref}>Export CSV (Excel)</a>
      </div>

      <TabContent tab={tab} stats={stats} menuNameByNumber={menuNameByNumber} />
    </div>
  )
}

function TabContent({
  tab,
  stats,
  menuNameByNumber,
}: {
  tab: TabKey
  stats: Awaited<ReturnType<typeof buildStatsPayload>>
  menuNameByNumber: Map<number, string>
}): React.ReactElement {
  if (tab === 'period') {
    const max = Math.max(1, ...stats.period.map((p) => p.totalViews))
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>Period</th>
            <th style={cell}>Page views</th>
            <th style={{ ...cell, textAlign: 'right' }}>Unique visitors</th>
          </tr>
        </thead>
        <tbody>
          {stats.period.length === 0 ? (
            <tr>
              <td style={cell} colSpan={3}>
                No data in this range.
              </td>
            </tr>
          ) : (
            stats.period.map((p) => (
              <tr key={p.period}>
                <td style={cell}>{p.period}</td>
                <td style={{ ...cell, width: 260 }}>
                  <div style={barTrack}>
                    <div
                      style={{
                        width: `${Math.round((p.totalViews / max) * 100)}%`,
                        height: '100%',
                        background: 'var(--theme-success-500, #2e7d32)',
                      }}
                    />
                  </div>
                  <span style={{ marginLeft: 8 }}>{p.totalViews.toLocaleString()}</span>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>{p.uniqueVisitors.toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    )
  }

  if (tab === 'menu') {
    const max = Math.max(1, ...stats.menu.map((m) => m.views))
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>Page</th>
            <th style={cell}>Views</th>
            <th style={{ ...cell, textAlign: 'right' }}>Count</th>
          </tr>
        </thead>
        <tbody>
          {stats.menu.length === 0 ? (
            <tr>
              <td style={cell} colSpan={3}>
                No data in this range.
              </td>
            </tr>
          ) : (
            stats.menu.map((m) => {
              const name = m.menuNumber != null ? menuNameByNumber.get(m.menuNumber) : undefined
              const label = name ? `${name} (${m.path})` : m.path
              return <BarRow key={m.path} label={label} value={m.views} max={max} />
            })
          )}
        </tbody>
      </table>
    )
  }

  // os / browser / device
  const rows = withPercentages(stats[tab])
  const max = Math.max(1, ...rows.map((r) => r.views))
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={cell}>{tab === 'os' ? 'OS' : tab === 'browser' ? 'Browser' : 'Device'}</th>
          <th style={cell}>Share</th>
          <th style={{ ...cell, textAlign: 'right' }}>Views</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td style={cell} colSpan={3}>
              No data in this range.
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.key}>
              <td style={cell}>
                {r.key}{' '}
                <span style={{ color: 'var(--theme-elevation-500, #888)' }}>({r.percentage}%)</span>
              </td>
              <td style={{ ...cell, width: 260 }}>
                <div style={barTrack}>
                  <div
                    style={{
                      width: `${Math.round((r.views / max) * 100)}%`,
                      height: '100%',
                      background: 'var(--theme-success-500, #2e7d32)',
                    }}
                  />
                </div>
              </td>
              <td style={{ ...cell, textAlign: 'right' }}>{r.views.toLocaleString()}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
