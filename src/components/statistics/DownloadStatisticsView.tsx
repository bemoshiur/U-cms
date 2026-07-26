import type { PayloadRequest } from 'payload'
import React from 'react'

import { hasMenuAccess, isSuperUser } from '@/access/hasMenuAccess'
import { getAssignedTenantIds } from '@/access/tenantAccess'
import { downloadRowLabel } from '@/content/downloadStats'
import { DOWNLOAD_STATS_MENU_KEY } from '@/endpoints/downloadStatsExport'
import { buildDownloadStatsPayload, loadDownloadRows } from '@/site/downloadStatsData'

/**
 * Download statistics admin view (Task 5B; TODO 5.3, ref 2-18). A custom
 * top-level admin view at `/admin/download-statistics`, registered in
 * payload.config.ts and linked from the nav (StatisticsNavLink). SERVER
 * component: it reads the caller from `initPageResult.req`, GATES on
 * `statistics.downloads`, scopes the per-site selector to the caller's assigned
 * sites, and renders the TOP-20 most-downloaded files as bars + a full detail
 * table, with a CSV export link to `/api/posts/download-stats/export`.
 *
 * Deliberately minimal + no chart library (a table + basic bars): all controls
 * are no-JS GET forms/links, and the data comes from the shared
 * `downloadStatsData` helpers (the SAME source the export endpoint uses, so the
 * view and CSV never diverge). Reads with `overrideAccess: true` because THIS
 * view's own gate has already authorized the caller + constrained the site list.
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
const barTrack: React.CSSProperties = {
  background: 'var(--theme-elevation-100, #eee)',
  borderRadius: 3,
  height: 10,
  minWidth: 40,
  overflow: 'hidden',
}

export async function DownloadStatisticsView(props: ViewProps): Promise<React.ReactElement> {
  const req = props.initPageResult?.req
  const payload = req?.payload
  const user = req?.user

  if (!payload || !user) {
    return (
      <div style={wrap}>
        <h1>Download Statistics</h1>
        <p>You must be signed in to view download statistics.</p>
      </div>
    )
  }

  if (!(await hasMenuAccess(req as PayloadRequest, DOWNLOAD_STATS_MENU_KEY))) {
    return (
      <div style={wrap}>
        <h1>Download Statistics</h1>
        <p>
          You do not have permission to view download statistics (requires Site Statistics ·
          Downloads).
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
        <h1>Download Statistics</h1>
        <p>No sites are assigned to your account.</p>
      </div>
    )
  }

  const sp = props.searchParams ?? {}
  const requestedSite = firstParam(sp.site)
  const firstSite = siteOptions[0]!
  const selectedSite =
    siteOptions.find((s) => String(s.id) === String(requestedSite))?.id ?? firstSite.id

  const rows = await loadDownloadRows(payload, { tenantId: selectedSite })
  const stats = buildDownloadStatsPayload(rows)
  const exportHref = `/api/posts/download-stats/export?site=${encodeURIComponent(String(selectedSite))}`
  const maxTop = Math.max(1, ...stats.top.map((r) => r.downloadCount))

  return (
    <div style={wrap}>
      <h1 style={{ marginBottom: '.25rem' }}>Download Statistics</h1>
      <p style={{ color: 'var(--theme-elevation-500, #888)', marginTop: 0 }}>
        Cumulative per-file download counts, joined to the owning board/post. The Top 20 chart plus
        a full detail table.
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
          <div>Site</div>
          <select name="site" defaultValue={String(selectedSite)}>
            {siteOptions.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {typeof s.name === 'string' ? s.name : String(s.siteId ?? s.id)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      {/* Headline totals */}
      <div style={{ display: 'flex', gap: '2rem', margin: '1rem 0' }}>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
            {stats.totalDownloads.toLocaleString()}
          </div>
          <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Total downloads</div>
        </div>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>
            {stats.fileCount.toLocaleString()}
          </div>
          <div style={{ color: 'var(--theme-elevation-500, #888)' }}>Files</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.5rem' }}>
        <a href={exportHref}>Export CSV (Excel)</a>
      </div>

      {/* TOP-20 chart */}
      <h2 style={{ fontSize: '1.1rem' }}>Top 20 most-downloaded files</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th style={cell}>File</th>
            <th style={cell}>Downloads</th>
            <th style={{ ...cell, textAlign: 'right' }}>Count</th>
          </tr>
        </thead>
        <tbody>
          {stats.top.length === 0 ? (
            <tr>
              <td style={cell} colSpan={3}>
                No downloads recorded yet.
              </td>
            </tr>
          ) : (
            stats.top.map((r) => (
              <tr key={`${r.postId}-${r.fileSn}`}>
                <td style={cell}>{downloadRowLabel(r)}</td>
                <td style={{ ...cell, width: 260 }}>
                  <div style={barTrack}>
                    <div
                      style={{
                        width: `${Math.round((r.downloadCount / maxTop) * 100)}%`,
                        height: '100%',
                        background: 'var(--theme-success-500, #2e7d32)',
                      }}
                    />
                  </div>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>{r.downloadCount.toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Full detail table */}
      <h2 style={{ fontSize: '1.1rem' }}>All files</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>Board</th>
            <th style={cell}>Post</th>
            <th style={cell}>File</th>
            <th style={{ ...cell, textAlign: 'right' }}>Downloads</th>
          </tr>
        </thead>
        <tbody>
          {stats.detail.length === 0 ? (
            <tr>
              <td style={cell} colSpan={4}>
                No attachments on this site.
              </td>
            </tr>
          ) : (
            stats.detail.map((r) => (
              <tr key={`${r.postId}-${r.fileSn}`}>
                <td style={cell}>{r.boardName ?? '—'}</td>
                <td style={cell}>{r.postTitle}</td>
                <td style={cell}>{r.filename ?? r.description ?? '—'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{r.downloadCount.toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
