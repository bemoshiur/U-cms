import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { ACCESSIBILITY_MENU_KEY, SEVERITY_LABELS } from '../accessibility/constants'
import { hasMenuAccess } from '../access/hasMenuAccess'
import {
  buildItemizedReport,
  buildMonthlyStats,
  buildResultsSummary,
  loadScanResults,
  type ScanResultRow,
} from '../site/accessibilityStatsData'
import { isAssignedToSite } from './downloadStatsExport'

/**
 * Web-accessibility auto-diagnosis data + CSV export endpoints (Phase 8, Task
 * 8.2; refs 2-21/2-22/2-23), mounted on the `accessibilityScanResults`
 * collection:
 *
 *   GET /api/accessibilityScanResults/results[/export]?site&keyword&source  → 2-21 list
 *   GET /api/accessibilityScanResults/statistics[/export]?site              → 2-23 monthly trend
 *   GET /api/accessibilityScanResults/report[/export]?site                  → 2-23 itemized report
 *
 * ACCESS-GATED on `statistics.accessibility` (else 403) AND TENANT-SCOPED: the
 * caller must be assigned to the requested `site` (or be super) — an unassigned
 * site yields an EMPTY result (site A never leaks into site B), mirroring the
 * download/traffic exports. CSV reuses the dependency-free `csvCell` pattern
 * (neutralizes leading `= + - @`) + `Cache-Control: private, no-store`.
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
function forbidden(): Response {
  return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
}

function parseSite(sp: URLSearchParams | undefined): string | Response {
  const site = sp?.get('site') ?? ''
  if (!site) {
    return Response.json({ ok: false, message: 'A site id is required.' }, { status: 400 })
  }
  return site
}

/**
 * Gate + tenant check + load, returning the scoped rows (or an error Response,
 * or `[]` when the caller isn't assigned to the site — never another tenant's
 * data). The single choke point every handler funnels through.
 */
async function resolveRows(args: {
  payload: Payload
  req: PayloadRequest
  site: string
  keyword?: string
  source?: string
}): Promise<ScanResultRow[] | Response> {
  const { payload, req, site, keyword, source } = args
  if (!(await hasMenuAccess(req, ACCESSIBILITY_MENU_KEY))) {
    return forbidden()
  }
  if (!isAssignedToSite(req.user, site)) {
    return []
  }
  return loadScanResults(payload, { query: { tenantId: site, keyword, source }, req })
}

/* ── 2-21 results list ───────────────────────────────────────────────────────── */

export async function handleResultsList(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) return site
  const rows = await resolveRows({
    payload: args.payload,
    req: args.req,
    site,
    keyword: args.searchParams?.get('keyword') ?? undefined,
    source: args.searchParams?.get('source') ?? undefined,
  })
  if (rows instanceof Response) return rows
  return Response.json(
    { ok: true, rows, summary: buildResultsSummary(rows) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

function resultsListCsvRows(rows: ScanResultRow[]): string[][] {
  const header = [
    '화면명',
    '경로',
    '전체건수',
    '성공건수',
    '에러건수',
    '심각',
    '위험',
    '경고',
    '검사일시',
  ]
  return [
    header,
    ...rows.map((r) => [
      r.screenName,
      r.route,
      String(r.totalItems),
      String(r.successCount),
      String(r.errorCount),
      String(r.criticalCount),
      String(r.dangerCount),
      String(r.warningCount),
      r.inspectedAt ? r.inspectedAt.slice(0, 19).replace('T', ' ') : '',
    ]),
  ]
}

export async function handleResultsListExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) return site
  const rows = await resolveRows({
    payload: args.payload,
    req: args.req,
    site,
    keyword: args.searchParams?.get('keyword') ?? undefined,
    source: args.searchParams?.get('source') ?? undefined,
  })
  if (rows instanceof Response) return rows
  return csvResponse(csvDocument(resultsListCsvRows(rows)), `accessibility-results-${site}.csv`)
}

/* ── 2-23 monthly statistics ─────────────────────────────────────────────────── */

export async function handleStatistics(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) return site
  const rows = await resolveRows({ payload: args.payload, req: args.req, site })
  if (rows instanceof Response) return rows
  return Response.json(
    { ok: true, stats: buildMonthlyStats(rows) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

function statisticsCsvRows(rows: ScanResultRow[]): string[][] {
  const stats = buildMonthlyStats(rows)
  const header = ['년월', '검사화면수', '검사건수', '에러건수', '심각건수', '위험건수', '경고건수']
  return [
    header,
    ...stats.rows.map((r) => [
      r.ym,
      String(r.inspectedScreens),
      String(r.inspections),
      String(r.errorCount),
      String(r.criticalCount),
      String(r.dangerCount),
      String(r.warningCount),
    ]),
  ]
}

export async function handleStatisticsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) return site
  const rows = await resolveRows({ payload: args.payload, req: args.req, site })
  if (rows instanceof Response) return rows
  return csvResponse(csvDocument(statisticsCsvRows(rows)), `accessibility-statistics-${site}.csv`)
}

/* ── 2-23 itemized inspection report ─────────────────────────────────────────── */

export async function handleReport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) return site
  const rows = await resolveRows({ payload: args.payload, req: args.req, site })
  if (rows instanceof Response) return rows
  return Response.json(
    { ok: true, report: buildItemizedReport(rows) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

function reportCsvRows(rows: ScanResultRow[]): string[][] {
  const report = buildItemizedReport(rows)
  const header = ['진단항목(rule)', '설명', '심각도', '오류화면수', '개선(발생수)', '준수율(%)']
  return [
    header,
    ...report.rows.map((r) => [
      r.ruleId,
      r.description,
      SEVERITY_LABELS[r.severity],
      String(r.errorScreens),
      String(r.occurrences),
      String(r.complianceRate),
    ]),
  ]
}

export async function handleReportExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const site = parseSite(args.searchParams)
  if (site instanceof Response) return site
  const rows = await resolveRows({ payload: args.payload, req: args.req, site })
  if (rows instanceof Response) return rows
  return csvResponse(csvDocument(reportCsvRows(rows)), `accessibility-report-${site}.csv`)
}

export const accessibilityStatsEndpoints: Endpoint[] = [
  {
    path: '/results',
    method: 'get',
    handler: async (req) =>
      handleResultsList({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/results/export',
    method: 'get',
    handler: async (req) =>
      handleResultsListExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/statistics',
    method: 'get',
    handler: async (req) =>
      handleStatistics({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/statistics/export',
    method: 'get',
    handler: async (req) =>
      handleStatisticsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/report',
    method: 'get',
    handler: async (req) =>
      handleReport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/report/export',
    method: 'get',
    handler: async (req) =>
      handleReportExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
