import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess, isSuperUser } from '../access/hasMenuAccess'
import { getAssignedTenantIds } from '../access/tenantAccess'
import { downloadRowLabel } from '../content/downloadStats'
import {
  buildDownloadStatsPayload,
  type DownloadStatsPayload,
  loadDownloadRows,
} from '../site/downloadStatsData'

/**
 * Download statistics data + Excel/CSV export endpoints (Task 5B; TODO 5.3, ref
 * 2-18). Collection endpoints on `posts` (where the cumulative per-file
 * `downloadCount` lives):
 *
 *   GET /api/posts/download-stats?site            → JSON (total + top-20 + detail)
 *   GET /api/posts/download-stats/export?site     → CSV (the full detail table)
 *
 * ACCESS-GATED + TENANT-SCOPED, mirroring trafficExport: the caller must hold
 * `statistics.downloads` (else 403) AND be assigned to the requested `site` (or
 * be super) — an unassigned site yields an EMPTY result (site A's downloads
 * never leak into site B's export). Because the counts live in `posts` (gated on
 * a DIFFERENT key, `content.posts`), the tenant boundary is an explicit
 * assignment check + a `where: { tenant }` read here, not the caller's own posts
 * access. CSV (not XLSX) keeps this dependency-free; the formatter guards CSV
 * injection.
 */

/** Permanent menu-grant key gating the download statistics (shared with the view). */
export const DOWNLOAD_STATS_MENU_KEY = 'statistics.downloads'

/** Quotes a CSV cell and neutralizes leading formula characters (=,+,-,@). */
function csvCell(value: string): string {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${neutralized.replace(/"/g, '""')}"`
}

function csvDocument(rows: string[][]): string {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return `﻿${body}\r\n` // UTF-8 BOM so Excel opens Unicode correctly.
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

/** True iff the caller may read the requested site's data (super or assigned). */
export function isAssignedToSite(user: unknown, site: string): boolean {
  if (isSuperUser(user)) {
    return true
  }
  return getAssignedTenantIds(user).some((id) => String(id) === String(site))
}

/** Resolves the access-gated, tenant-scoped download-stats payload, or an error Response. */
async function resolveDownloadStats(args: {
  payload: Payload
  req: PayloadRequest
  site: string
}): Promise<DownloadStatsPayload | Response> {
  const { payload, req, site } = args
  if (!(await hasMenuAccess(req, DOWNLOAD_STATS_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  // Unassigned site → empty (never another tenant's rows), mirroring the
  // traffic export's tenant-scoped-empty semantics.
  if (!isAssignedToSite(req.user, site)) {
    return buildDownloadStatsPayload([])
  }
  const rows = await loadDownloadRows(payload, { tenantId: site, req })
  return buildDownloadStatsPayload(rows)
}

function parseSite(sp: URLSearchParams | undefined): string | Response {
  const site = sp?.get('site') ?? ''
  if (!site) {
    return Response.json({ ok: false, message: 'A site id is required.' }, { status: 400 })
  }
  return site
}

/** JSON download-stats endpoint handler (testable core). */
export async function handleDownloadStats(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) {
    return site
  }
  const result = await resolveDownloadStats({ payload: args.payload, req: args.req, site })
  if (result instanceof Response) {
    return result
  }
  return Response.json(
    { ok: true, stats: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/** Builds the CSV rows for the full download detail table. */
export function downloadStatsToCsvRows(stats: DownloadStatsPayload): string[][] {
  return [
    ['Board', 'Post', 'File', 'Description', 'Downloads'],
    ...stats.detail.map((r) => [
      r.boardName ?? '',
      r.postTitle,
      r.filename ?? '',
      r.description ?? '',
      String(r.downloadCount),
    ]),
  ]
}

/** CSV export endpoint handler (testable core). */
export async function handleDownloadStatsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) {
    return site
  }
  const result = await resolveDownloadStats({ payload: args.payload, req: args.req, site })
  if (result instanceof Response) {
    return result
  }
  const filename = `downloads-${site}.csv`
  return csvResponse(csvDocument(downloadStatsToCsvRows(result)), filename)
}

/** Re-exported for the view (shared label formatting). */
export { downloadRowLabel }

export const downloadStatsEndpoints: Endpoint[] = [
  {
    path: '/download-stats',
    method: 'get',
    handler: async (req) =>
      handleDownloadStats({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/download-stats/export',
    method: 'get',
    handler: async (req) =>
      handleDownloadStatsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
