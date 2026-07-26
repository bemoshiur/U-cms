import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import {
  buildSatisfactionStatsPayload,
  loadSatisfactionRatings,
  loadSiteMenus,
  type SatisfactionStatsPayload,
} from '../site/satisfactionStatsData'
import { isAssignedToSite } from './downloadStatsExport'

/**
 * Permanent menu-grant key gating the satisfaction data + statistics (shared by
 * the `satisfactionRatings` collection, the export endpoints, and the view).
 * Defined HERE (not on the collection) so the collection can import BOTH the key
 * and the endpoints from one place without a circular import — the same
 * one-directional arrangement as trafficDaily ← trafficExport.
 */
export const SATISFACTION_MENU_KEY = 'statistics.satisfaction'

/**
 * Satisfaction statistics data + Excel/CSV export endpoints (Task 5B; TODO 5.4,
 * ref 2-19). Collection endpoints on `satisfactionRatings`:
 *
 *   GET /api/satisfactionRatings/stats?site&department&menu         → JSON
 *   GET /api/satisfactionRatings/stats/export?site&department&menu  → CSV
 *
 * ACCESS-GATED + TENANT-SCOPED, mirroring trafficExport: the caller must hold
 * `statistics.satisfaction` (else 403) AND be assigned to the requested `site`
 * (or be super) — an unassigned site yields an EMPTY result (site A's ratings /
 * menu names never leak into site B's view). Ratings are additionally read under
 * the caller's OWN tenant-scoped access (defense in depth). `department`/`menu`
 * apply the cascade. CSV (not XLSX) keeps this dependency-free; the formatter
 * guards CSV injection.
 */

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

type StatsQuery = {
  site: string
  departmentId: string | null
  menuId: string | null
}

function parseQuery(sp: URLSearchParams | undefined): StatsQuery | Response {
  const site = sp?.get('site') ?? ''
  if (!site) {
    return Response.json({ ok: false, message: 'A site id is required.' }, { status: 400 })
  }
  return {
    site,
    departmentId: sp?.get('department') || null,
    menuId: sp?.get('menu') || null,
  }
}

/** Resolves the access-gated, tenant-scoped satisfaction-stats payload, or a Response. */
async function resolveSatisfactionStats(args: {
  payload: Payload
  req: PayloadRequest
  query: StatsQuery
}): Promise<SatisfactionStatsPayload | Response> {
  const { payload, req, query } = args
  if (!(await hasMenuAccess(req, SATISFACTION_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  // Unassigned site → empty (never another tenant's ratings or menu names).
  if (!isAssignedToSite(req.user, query.site)) {
    return buildSatisfactionStatsPayload({ ratings: [], menus: [] })
  }
  const [ratings, menus] = await Promise.all([
    // Defense in depth: also read under the caller's own tenant-scoped access.
    loadSatisfactionRatings(payload, {
      tenantId: query.site,
      user: req.user,
      overrideAccess: false,
      req,
    }),
    loadSiteMenus(payload, query.site, req),
  ])
  return buildSatisfactionStatsPayload({
    ratings,
    menus,
    departmentId: query.departmentId,
    menuId: query.menuId,
  })
}

/** JSON stats endpoint handler (testable core). */
export async function handleSatisfactionStats(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const query = parseQuery(args.searchParams)
  if (query instanceof Response) {
    return query
  }
  const result = await resolveSatisfactionStats({ payload: args.payload, req: args.req, query })
  if (result instanceof Response) {
    return result
  }
  return Response.json(
    { ok: true, stats: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/** Builds the CSV rows: a summary header, the score distribution, and per-menu averages. */
export function satisfactionStatsToCsvRows(stats: SatisfactionStatsPayload): string[][] {
  const rows: string[][] = [
    ['Metric', 'Value'],
    ['Total ratings', String(stats.count)],
    ['Weighted average', stats.weightedAverage === null ? '' : String(stats.weightedAverage)],
    ['Satisfaction (%)', stats.percent === null ? '' : String(stats.percent)],
    [],
    ['Score', 'Count', 'Percentage (%)'],
    ...stats.distribution.map((b) => [String(b.score), String(b.count), String(b.percentage)]),
    [],
    ['Menu', 'Count', 'Average', 'Satisfaction (%)'],
    ...stats.byMenu.map((m) => [
      m.menuName,
      String(m.count),
      m.average === null ? '' : String(m.average),
      m.percent === null ? '' : String(m.percent),
    ]),
  ]
  return rows
}

/** CSV export endpoint handler (testable core). */
export async function handleSatisfactionStatsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const query = parseQuery(args.searchParams)
  if (query instanceof Response) {
    return query
  }
  const result = await resolveSatisfactionStats({ payload: args.payload, req: args.req, query })
  if (result instanceof Response) {
    return result
  }
  const filename = `satisfaction-${query.site}.csv`
  return csvResponse(csvDocument(satisfactionStatsToCsvRows(result)), filename)
}

export const satisfactionStatsExportEndpoints: Endpoint[] = [
  {
    path: '/stats',
    method: 'get',
    handler: async (req) =>
      handleSatisfactionStats({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/stats/export',
    method: 'get',
    handler: async (req) =>
      handleSatisfactionStatsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
