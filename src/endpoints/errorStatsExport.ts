import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import type { ErrorStatsPayload } from '../content/errorStats'
import { buildErrorStats, loadErrorRows } from '../site/errorStatsData'

/**
 * Error statistics data + CSV export endpoints (Task 5C; refs 1-58/1-59).
 * Collection endpoints on `errorLogs`:
 *
 *   GET /api/errorLogs/stats?from&to&granularity            → JSON (period/type/url tabs)
 *   GET /api/errorLogs/stats/export?from&to&granularity&tab → CSV (one tab)
 *
 * ACCESS-GATED on `system.errorLogs` (else 403). `errorLogs` is a GLOBAL,
 * system-wide store (no tenant dimension — see the collection), so there is no
 * per-site scoping here; the menu gate is the whole access boundary. CSV (not
 * XLSX) keeps this dependency-free; the formatter guards CSV injection, and the
 * response is `Cache-Control: private, no-store` (per-user, never shared-cached),
 * mirroring the traffic/download/satisfaction exports.
 */

/** Permanent menu-grant key gating the error-log collection, stats view + export. */
export const ERROR_LOGS_MENU_KEY = 'system.errorLogs'

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
const VALID_TABS = ['period', 'type', 'url'] as const
export type ErrorStatsTab = (typeof VALID_TABS)[number]

/** `YYYY-MM-DD` for a Date in UTC. */
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type StatsQuery = { from: string; to: string; granularity: 'daily' | 'monthly' }

/** Parses + validates the shared query. Returns a 400 `Response` on a bad shape. */
function parseStatsQuery(sp: URLSearchParams | undefined): StatsQuery | Response {
  const today = utcDay(new Date())
  const defaultFrom = utcDay(new Date(Date.now() - 29 * 86_400_000))
  const from = sp?.get('from') || defaultFrom
  const to = sp?.get('to') || today
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return Response.json(
      { ok: false, message: 'from/to must be YYYY-MM-DD dates.' },
      { status: 400 },
    )
  }
  const granularity = sp?.get('granularity') === 'monthly' ? 'monthly' : 'daily'
  return { from, to, granularity }
}

/** Resolves the access-gated error-stats payload, or an error `Response`. */
async function resolveErrorStats(args: {
  payload: Payload
  req: PayloadRequest
  query: StatsQuery
}): Promise<ErrorStatsPayload | Response> {
  const { payload, req, query } = args
  if (!(await hasMenuAccess(req, ERROR_LOGS_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  const rows = await loadErrorRows(payload, { from: query.from, to: query.to, req })
  return buildErrorStats(rows, { from: query.from, to: query.to, granularity: query.granularity })
}

/** JSON error-stats endpoint handler (testable core). */
export async function handleErrorStats(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const query = parseStatsQuery(args.searchParams)
  if (query instanceof Response) {
    return query
  }
  const result = await resolveErrorStats({ payload: args.payload, req: args.req, query })
  if (result instanceof Response) {
    return result
  }
  return Response.json(
    { ok: true, stats: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/** Builds the CSV rows for one tab from the resolved stats payload. */
export function errorStatsTabToCsvRows(stats: ErrorStatsPayload, tab: ErrorStatsTab): string[][] {
  if (tab === 'period') {
    return [['Period', 'Errors'], ...stats.period.map((p) => [p.period, String(p.count)])]
  }
  if (tab === 'type') {
    return [['Exception class', 'Errors'], ...stats.type.map((r) => [r.key, String(r.count)])]
  }
  return [['URL', 'Errors'], ...stats.url.map((r) => [r.key, String(r.count)])]
}

/** CSV export endpoint handler (testable core). */
export async function handleErrorStatsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const query = parseStatsQuery(args.searchParams)
  if (query instanceof Response) {
    return query
  }
  const tabRaw = args.searchParams?.get('tab') ?? 'period'
  if (!VALID_TABS.includes(tabRaw as ErrorStatsTab)) {
    return Response.json(
      { ok: false, message: `tab must be one of: ${VALID_TABS.join(', ')}.` },
      { status: 400 },
    )
  }
  const tab = tabRaw as ErrorStatsTab
  const result = await resolveErrorStats({ payload: args.payload, req: args.req, query })
  if (result instanceof Response) {
    return result
  }
  const filename = `errors-${tab}-${query.from}_${query.to}.csv`
  return csvResponse(csvDocument(errorStatsTabToCsvRows(result, tab)), filename)
}

export const errorStatsExportEndpoints: Endpoint[] = [
  {
    path: '/stats',
    method: 'get',
    handler: async (req) =>
      handleErrorStats({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/stats/export',
    method: 'get',
    handler: async (req) =>
      handleErrorStatsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
