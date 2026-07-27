import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import {
  META_INSPECTION_RULE_IDS,
  SELF_CHECK_ERROR_TYPES,
  STD_META_INSPECTION_MENU_KEY,
  STD_SELF_CHECK_MENU_KEY,
  STD_SELF_CHECK_STATS_MENU_KEY,
} from '../standardization/constants'
import type { RuleId } from '../standardization/rules'
import { inspectSchema, type InspectionRow } from '../site/standardizationIntrospection'
import { runSelfCheckAllSources, type SelfCheckDetail } from '../site/standardizationSelfCheck'
import {
  buildSelfCheckStats,
  loadSelfCheckSnapshots,
  type SelfCheckStatsQuery,
} from '../site/standardizationStats'

/**
 * Standardization engine endpoints (Phase 8, Task 8.1b), mounted on the
 * `standardizationSelfChecks` collection. Each self-gates on its own menuKey,
 * independent of the host collection's gate:
 *
 *   GET  /api/standardizationSelfChecks/meta-inspection[/export]  → 1-66 grid (metaInspection gate)
 *   GET  /api/standardizationSelfChecks/self-check[/export]       → 1-75 snapshots (selfCheck gate)
 *   POST /api/standardizationSelfChecks/run                       → 1-75 Run Check (selfCheck gate)
 *   GET  /api/standardizationSelfChecks/statistics[/export]       → 1-76 stats (selfCheckStats gate)
 *
 * CSV reuses the dependency-free pattern from errorStatsExport/codeSpecExport:
 * `csvCell` neutralizes leading formula chars (= + - @); responses are
 * `Cache-Control: private, no-store`. No xlsx dependency.
 */

/* ── shared dependency-free CSV helpers (same pattern as errorStatsExport.ts) ── */
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

/* ── Meta-term inspection (ref 1-66): four rules, live schema ────────────────── */

/** The four grid columns (오류1..오류4) and the underlying rule ids they surface. */
const META_COLUMNS = META_INSPECTION_RULE_IDS.map((id, i) => ({ label: `오류${i + 1}`, id }))

export type MetaInspectionQuery = {
  source?: string
  errorType?: string // one of 'error1'|'error2'|'error3'|'error5' (or '오류N'); undefined = all
  failOnly?: boolean
  keyword?: string
}

function parseMetaQuery(sp: URLSearchParams | undefined): MetaInspectionQuery {
  const et = sp?.get('errorType') ?? undefined
  return {
    source: sp?.get('source') || 'mois',
    errorType: et || undefined,
    failOnly: sp?.get('failOnly') === '1' || sp?.get('failOnly') === 'true',
    keyword: sp?.get('keyword') ?? undefined,
  }
}

/** Resolves the requested rule id from a filter value ('오류1'..'오류4' or 'errorN'). */
function resolveMetaErrorId(value: string | undefined): RuleId | undefined {
  if (!value) return undefined
  const byLabel = META_COLUMNS.find((c) => c.label === value)
  if (byLabel) return byLabel.id
  return META_COLUMNS.some((c) => c.id === value) ? (value as RuleId) : undefined
}

export type MetaInspectionResult = {
  rows: {
    tableName: string
    columnName: string
    logicalName: string
    dataType: string
    domain: string
    verdicts: { label: string; verdict: 'SUCCESS' | 'FAIL' }[]
  }[]
  counts: { label: string; count: number }[]
  total: number
}

export async function loadMetaInspection(
  payload: Payload,
  args: { query?: MetaInspectionQuery; req?: PayloadRequest } = {},
): Promise<MetaInspectionResult> {
  const { query = {}, req } = args
  const { rows } = await inspectSchema(payload, { source: query.source, req })

  const errorId = resolveMetaErrorId(query.errorType)
  const keyword = query.keyword?.trim().toLowerCase()

  let filtered: InspectionRow[] = rows
  if (query.failOnly) {
    filtered = filtered.filter((r) => META_COLUMNS.some((c) => r.fails[c.id]))
  }
  if (errorId) {
    filtered = filtered.filter((r) => r.fails[errorId])
  }
  if (keyword) {
    filtered = filtered.filter((r) =>
      [r.tableName, r.columnName, r.logicalName, r.domain].join('').toLowerCase().includes(keyword),
    )
  }

  const counts = META_COLUMNS.map((c) => ({
    label: c.label,
    count: rows.filter((r) => r.fails[c.id]).length,
  }))

  return {
    rows: filtered.map((r) => ({
      tableName: r.tableName,
      columnName: r.columnName,
      logicalName: r.logicalName,
      dataType: r.dataType,
      domain: r.domain,
      verdicts: META_COLUMNS.map((c) => ({
        label: c.label,
        verdict: r.fails[c.id] ? ('FAIL' as const) : ('SUCCESS' as const),
      })),
    })),
    counts,
    total: filtered.length,
  }
}

function metaInspectionCsvRows(result: MetaInspectionResult): string[][] {
  const header = [
    '테이블명',
    '용어약어명',
    '용어명',
    '데이터타입',
    '도메인명',
    ...META_COLUMNS.map((c) => c.label),
  ]
  return [
    header,
    ...result.rows.map((r) => [
      r.tableName,
      r.columnName,
      r.logicalName,
      r.dataType,
      r.domain,
      ...r.verdicts.map((v) => v.verdict),
    ]),
  ]
}

/* ── Self-check snapshots (ref 1-75) ─────────────────────────────────────────── */

const ERROR_LABELS = SELF_CHECK_ERROR_TYPES.map((e) => ({ id: e.id as RuleId, label: e.label }))

export type SelfCheckListResult = {
  snapshots: {
    id: number | string
    checkYearMonth: string
    standardSource: string
    counts: Record<RuleId, number>
    checkedAt: string
    detailCount: number
  }[]
}

export async function loadSelfCheckList(
  payload: Payload,
  args: { source?: string; req?: PayloadRequest } = {},
): Promise<SelfCheckListResult> {
  const { source, req } = args
  const res = await payload.find({
    collection: 'standardizationSelfChecks',
    ...(source ? { where: { standardSource: { equals: source } } } : {}),
    sort: '-checkYearMonth',
    limit: 10000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return {
    snapshots: res.docs.map((d) => {
      const counts = {} as Record<RuleId, number>
      for (const { id } of ERROR_LABELS)
        counts[id] = Number((d as unknown as Record<string, unknown>)[`${id}Count`] ?? 0)
      const details = Array.isArray((d as { details?: unknown }).details)
        ? ((d as { details?: unknown[] }).details as unknown[])
        : []
      return {
        id: d.id,
        checkYearMonth: String(d.checkYearMonth ?? ''),
        standardSource: String(d.standardSource ?? ''),
        counts,
        checkedAt:
          typeof d.checkedAt === 'string' ? d.checkedAt : d.checkedAt ? String(d.checkedAt) : '',
        detailCount: details.length,
      }
    }),
  }
}

function selfCheckSummaryCsvRows(result: SelfCheckListResult): string[][] {
  const header = ['점검연월', '표준출처', ...ERROR_LABELS.map((e) => e.label), '점검일']
  return [
    header,
    ...result.snapshots.map((s) => [
      s.checkYearMonth,
      s.standardSource,
      ...ERROR_LABELS.map((e) => String(s.counts[e.id] ?? 0)),
      s.checkedAt,
    ]),
  ]
}

/** Loads the detail rows of one snapshot (for the detail popup / detail CSV). */
async function loadSelfCheckDetail(
  payload: Payload,
  args: { ym: string; source: string; errorType?: string; req?: PayloadRequest },
): Promise<SelfCheckDetail[]> {
  const { ym, source, errorType, req } = args
  const res = await payload.find({
    collection: 'standardizationSelfChecks',
    where: { and: [{ checkYearMonth: { equals: ym } }, { standardSource: { equals: source } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  const raw = res.docs[0] ? (res.docs[0] as { details?: unknown }).details : undefined
  const details = Array.isArray(raw) ? (raw as SelfCheckDetail[]) : []
  if (errorType) {
    return details.filter(
      (d) => Array.isArray(d.errorTypes) && d.errorTypes.includes(errorType as RuleId),
    )
  }
  return details
}

function selfCheckDetailCsvRows(details: SelfCheckDetail[]): string[][] {
  return [
    ['테이블명', '컬럼명', '용어명', '데이터타입', '도메인명', '오류'],
    ...details.map((d) => [
      d.tableName,
      d.columnName,
      d.logicalName,
      d.dataType,
      d.domain,
      (d.errorTypes ?? [])
        .map((id) => ERROR_LABELS.find((e) => e.id === id)?.label ?? id)
        .join(' '),
    ]),
  ]
}

/* ── Statistics (ref 1-76) ───────────────────────────────────────────────────── */

function parseStatsQuery(sp: URLSearchParams | undefined): SelfCheckStatsQuery {
  return {
    source: sp?.get('source') || undefined,
    fromYm: sp?.get('fromYm') || undefined,
    toYm: sp?.get('toYm') || undefined,
  }
}

function statsCsvRows(
  table: {
    checkYearMonth: string
    standardSource: string
    counts: Record<RuleId, number>
    checkedAt: string
  }[],
): string[][] {
  const header = ['점검연월', '표준출처', ...ERROR_LABELS.map((e) => e.label), '점검일']
  return [
    header,
    ...table.map((r) => [
      r.checkYearMonth,
      r.standardSource,
      ...ERROR_LABELS.map((e) => String(r.counts[e.id] ?? 0)),
      r.checkedAt,
    ]),
  ]
}

/* ── Endpoint handlers (testable cores) ──────────────────────────────────────── */

export async function handleMetaInspection(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_META_INSPECTION_MENU_KEY))) return forbidden()
  const result = await loadMetaInspection(args.payload, {
    query: parseMetaQuery(args.searchParams),
    req: args.req,
  })
  return Response.json(
    { ok: true, metaInspection: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function handleMetaInspectionExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_META_INSPECTION_MENU_KEY))) return forbidden()
  const result = await loadMetaInspection(args.payload, {
    query: parseMetaQuery(args.searchParams),
    req: args.req,
  })
  return csvResponse(csvDocument(metaInspectionCsvRows(result)), 'meta-term-inspection.csv')
}

export async function handleSelfCheckList(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_SELF_CHECK_MENU_KEY))) return forbidden()
  const source = args.searchParams?.get('source') || undefined
  const ym = args.searchParams?.get('ym') || undefined
  const detailSource = args.searchParams?.get('detailSource') || source
  if (ym && detailSource) {
    const details = await loadSelfCheckDetail(args.payload, {
      ym,
      source: detailSource,
      errorType: args.searchParams?.get('errorType') || undefined,
      req: args.req,
    })
    return Response.json(
      { ok: true, details },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const result = await loadSelfCheckList(args.payload, { source, req: args.req })
  return Response.json(
    { ok: true, selfCheck: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function handleSelfCheckExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_SELF_CHECK_MENU_KEY))) return forbidden()
  const ym = args.searchParams?.get('ym') || undefined
  const source = args.searchParams?.get('source') || undefined
  // Detail export when a specific (ym, source) is given; else the summary grid.
  if (ym && source) {
    const details = await loadSelfCheckDetail(args.payload, {
      ym,
      source,
      errorType: args.searchParams?.get('errorType') || undefined,
      req: args.req,
    })
    return csvResponse(
      csvDocument(selfCheckDetailCsvRows(details)),
      `self-check-detail-${ym}-${source}.csv`,
    )
  }
  const result = await loadSelfCheckList(args.payload, { source, req: args.req })
  return csvResponse(csvDocument(selfCheckSummaryCsvRows(result)), 'self-check-results.csv')
}

export async function handleRunSelfCheck(args: {
  payload: Payload
  req: PayloadRequest
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_SELF_CHECK_MENU_KEY))) return forbidden()
  const snapshots = await runSelfCheckAllSources(args.payload, args.req)
  return Response.json(
    { ok: true, snapshots },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function handleSelfCheckStats(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_SELF_CHECK_STATS_MENU_KEY))) return forbidden()
  const rows = await loadSelfCheckSnapshots(args.payload, {
    query: parseStatsQuery(args.searchParams),
    req: args.req,
  })
  const stats = buildSelfCheckStats(rows)
  return Response.json({ ok: true, stats }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function handleSelfCheckStatsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_SELF_CHECK_STATS_MENU_KEY))) return forbidden()
  const rows = await loadSelfCheckSnapshots(args.payload, {
    query: parseStatsQuery(args.searchParams),
    req: args.req,
  })
  const stats = buildSelfCheckStats(rows)
  return csvResponse(csvDocument(statsCsvRows(stats.table)), 'self-check-statistics.csv')
}

export const standardizationEngineEndpoints: Endpoint[] = [
  {
    path: '/meta-inspection',
    method: 'get',
    handler: async (req) =>
      handleMetaInspection({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/meta-inspection/export',
    method: 'get',
    handler: async (req) =>
      handleMetaInspectionExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/self-check',
    method: 'get',
    handler: async (req) =>
      handleSelfCheckList({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/self-check/export',
    method: 'get',
    handler: async (req) =>
      handleSelfCheckExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/run',
    method: 'post',
    handler: async (req) => handleRunSelfCheck({ payload: req.payload, req }),
  },
  {
    path: '/statistics',
    method: 'get',
    handler: async (req) =>
      handleSelfCheckStats({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/statistics/export',
    method: 'get',
    handler: async (req) =>
      handleSelfCheckStatsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
