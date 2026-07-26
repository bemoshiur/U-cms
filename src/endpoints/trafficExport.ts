import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import { withPercentages } from '../content/trafficStats'
import {
  buildStatsPayload,
  loadDailyRollups,
  type StatsGranularity,
  type TrafficStatsPayload,
} from '../site/trafficStatsData'
import { utcDayString } from '../site/trafficAggregation'

/**
 * Traffic statistics data + Excel/CSV export endpoints (Task 5A; TODO 5.2, refs
 * 1-54 / 2-17). Collection endpoints on `trafficDaily`:
 *
 *   GET /api/trafficDaily/stats?site&from&to&granularity            → JSON (5 tabs)
 *   GET /api/trafficDaily/stats/export?site&from&to&granularity&tab → CSV (one tab)
 *
 * ACCESS-GATED + TENANT-SCOPED, mirroring boardExport/surveyExport: the caller
 * must hold `statistics.traffic` (else 403) AND be assigned to the requested
 * `site` — enforced by reading the rollups under the caller's OWN tenant-scoped
 * access (`overrideAccess: false`), so a site the caller isn't assigned to
 * yields an EMPTY result (site A's stats never leak into site B's export). Data
 * comes from the compact `trafficDaily` rollups (fast), never a raw scan. CSV
 * (not XLSX) keeps this dependency-free; the formatter guards CSV injection.
 */

/** Permanent menu-grant key gating the traffic statistics (shared with pageViews/trafficDaily). */
export const TRAFFIC_DAILY_MENU_KEY = 'statistics.traffic'

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const VALID_TABS = ['period', 'menu', 'os', 'browser', 'device'] as const
export type StatsTab = (typeof VALID_TABS)[number]

type StatsQuery = {
  site: string
  from: string
  to: string
  granularity: StatsGranularity
}

/** Parses + validates the shared query. Returns a 400 `Response` on a bad shape. */
function parseStatsQuery(sp: URLSearchParams | undefined): StatsQuery | Response {
  const site = sp?.get('site') ?? ''
  if (!site) {
    return Response.json({ ok: false, message: 'A site id is required.' }, { status: 400 })
  }
  const today = utcDayString(new Date())
  const defaultFrom = utcDayString(new Date(Date.now() - 29 * 86_400_000))
  const from = sp?.get('from') || defaultFrom
  const to = sp?.get('to') || today
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return Response.json(
      { ok: false, message: 'from/to must be YYYY-MM-DD dates.' },
      { status: 400 },
    )
  }
  const granularity: StatsGranularity = sp?.get('granularity') === 'monthly' ? 'monthly' : 'daily'
  return { site, from, to, granularity }
}

/** Resolves the access-gated, tenant-scoped stats payload, or an error `Response`. */
async function resolveStatsPayload(args: {
  payload: Payload
  req: PayloadRequest
  query: StatsQuery
}): Promise<TrafficStatsPayload | Response> {
  const { payload, req, query } = args
  // Menu gate first — a caller without the grant is denied outright.
  if (!(await hasMenuAccess(req, TRAFFIC_DAILY_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  // Tenant scope: read under the caller's OWN access — an unassigned site → empty.
  const dailies = await loadDailyRollups(payload, {
    tenantId: query.site,
    from: query.from,
    to: query.to,
    user: req.user,
    overrideAccess: false,
    req,
  })
  return buildStatsPayload(dailies, {
    from: query.from,
    to: query.to,
    granularity: query.granularity,
  })
}

/** JSON stats endpoint handler (testable core). */
export async function handleTrafficStats(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const query = parseStatsQuery(args.searchParams)
  if (query instanceof Response) {
    return query
  }
  const result = await resolveStatsPayload({ payload: args.payload, req: args.req, query })
  if (result instanceof Response) {
    return result
  }
  return Response.json({ ok: true, stats: result })
}

/** Builds the CSV rows for one tab from the resolved stats payload. */
export function statsTabToCsvRows(stats: TrafficStatsPayload, tab: StatsTab): string[][] {
  switch (tab) {
    case 'period':
      return [
        ['Period', 'Page Views', 'Unique Visitors'],
        ...stats.period.map((p) => [p.period, String(p.totalViews), String(p.uniqueVisitors)]),
      ]
    case 'menu':
      return [
        ['Path', 'Menu Number', 'Page Views'],
        ...stats.menu.map((m) => [
          m.path,
          m.menuNumber === null ? '' : String(m.menuNumber),
          String(m.views),
        ]),
      ]
    case 'os':
    case 'browser':
    case 'device': {
      const rows = withPercentages(stats[tab])
      const label = tab === 'os' ? 'OS' : tab === 'browser' ? 'Browser' : 'Device'
      return [
        [label, 'Page Views', 'Percentage (%)'],
        ...rows.map((r) => [r.key, String(r.views), String(r.percentage)]),
      ]
    }
  }
}

/** CSV export endpoint handler (testable core). */
export async function handleTrafficStatsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const query = parseStatsQuery(args.searchParams)
  if (query instanceof Response) {
    return query
  }
  const tabRaw = args.searchParams?.get('tab') ?? 'period'
  if (!VALID_TABS.includes(tabRaw as StatsTab)) {
    return Response.json(
      { ok: false, message: `tab must be one of: ${VALID_TABS.join(', ')}.` },
      { status: 400 },
    )
  }
  const tab = tabRaw as StatsTab

  const result = await resolveStatsPayload({ payload: args.payload, req: args.req, query })
  if (result instanceof Response) {
    return result
  }

  const rows = statsTabToCsvRows(result, tab)
  const filename = `traffic-${query.site}-${tab}-${query.from}_${query.to}.csv`
  return csvResponse(csvDocument(rows), filename)
}

export const trafficStatsExportEndpoints: Endpoint[] = [
  {
    path: '/stats',
    method: 'get',
    handler: async (req) =>
      handleTrafficStats({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/stats/export',
    method: 'get',
    handler: async (req) =>
      handleTrafficStatsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
