import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import { STD_TABLE_SETTINGS_MENU_KEY, TABLE_SOURCE_OPTIONS } from '../standardization/constants'
import { introspectTableNames } from '../site/standardizationIntrospection'

/**
 * Table Standard Settings endpoints (Phase 8, Task 8.1b; ref 1-67), mounted on
 * the `tableStandardSettings` collection. All self-gate on
 * `standardization.tableSettings` (DBA-only):
 *
 *   GET  /api/tableStandardSettings/tables         → live tables ∪ assignments + summary counts
 *   GET  /api/tableStandardSettings/tables/export  → CSV of the merged list
 *   POST /api/tableStandardSettings/batch-apply    → assign a source to selected tables (일괄적용)
 *
 * The list is the union of the LIVE physical tables (introspected, READ-ONLY)
 * and any stored assignment row — so newly-created tables appear as 미지정 until
 * assigned. Batch apply upserts the assignment for each selected table name.
 */

const VALID_SOURCES = new Set<string>(TABLE_SOURCE_OPTIONS.map((o) => o.value))

/* ── dependency-free CSV helpers (same pattern as errorStatsExport.ts) ── */
function csvCell(value: string): string {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${neutralized.replace(/"/g, '""')}"`
}
function csvDocument(rows: string[][]): string {
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
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

export type TableSettingRow = {
  tableName: string
  tableCategory: string
  tableDescription: string
  standardSource: string
  physicalCreatedAt: string
}

export type TableSettingsResult = {
  rows: TableSettingRow[]
  summary: {
    total: number
    mois: number
    institution: number
    excluded: number
    unassigned: number
  }
}

export type TableSettingsQuery = {
  category?: string
  source?: string
  keyword?: string
}

/** Merges the live physical tables with stored assignments (union) + summary counts. */
export async function loadTableStandardSettings(
  payload: Payload,
  args: { query?: TableSettingsQuery; req?: PayloadRequest } = {},
): Promise<TableSettingsResult> {
  const { query = {}, req } = args

  const liveNames = await introspectTableNames(payload)
  const stored = await payload.find({
    collection: 'tableStandardSettings',
    limit: 100000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const storedByName = new Map<string, Record<string, unknown>>()
  for (const d of stored.docs)
    storedByName.set(String(d.tableName), d as unknown as Record<string, unknown>)

  const allNames = new Set<string>([...liveNames, ...storedByName.keys()])

  let rows: TableSettingRow[] = [...allNames].sort().map((name) => {
    const s = storedByName.get(name)
    return {
      tableName: name,
      tableCategory: s ? String(s.tableCategory ?? '기본') : '기본',
      tableDescription: s ? String(s.tableDescription ?? '') : '',
      standardSource: s ? String(s.standardSource ?? 'unassigned') : 'unassigned',
      physicalCreatedAt: s ? String(s.physicalCreatedAt ?? '') : '',
    }
  })

  // Summary is computed over the FULL merged set (before filtering, ref 1-67).
  const summary = {
    total: rows.length,
    mois: rows.filter((r) => r.standardSource === 'mois').length,
    institution: rows.filter((r) => r.standardSource === 'institution').length,
    excluded: rows.filter((r) => r.standardSource === 'excluded').length,
    unassigned: rows.filter((r) => r.standardSource === 'unassigned').length,
  }

  if (query.category) rows = rows.filter((r) => r.tableCategory === query.category)
  if (query.source) rows = rows.filter((r) => r.standardSource === query.source)
  const keyword = query.keyword?.trim().toLowerCase()
  if (keyword) {
    rows = rows.filter((r) =>
      [r.tableName, r.tableDescription].join('').toLowerCase().includes(keyword),
    )
  }

  return { rows, summary }
}

/** Batch-applies a standard source to the given table names (일괄적용). Upsert per table. */
export async function batchApplyTableSource(
  payload: Payload,
  args: { tableNames: string[]; standardSource: string; req?: PayloadRequest },
): Promise<{ applied: number }> {
  const { tableNames, standardSource, req } = args
  if (!VALID_SOURCES.has(standardSource)) {
    throw new Error(`Invalid standard source "${standardSource}".`)
  }
  const names = Array.from(
    new Set((tableNames ?? []).filter((n) => typeof n === 'string' && n.length > 0)),
  )
  let applied = 0
  for (const tableName of names) {
    const existing = await payload.find({
      collection: 'tableStandardSettings',
      where: { tableName: { equals: tableName } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
      req,
    })
    if (existing.docs[0]) {
      await payload.update({
        collection: 'tableStandardSettings',
        id: existing.docs[0].id,
        data: { standardSource } as never,
        overrideAccess: true,
        req,
      })
    } else {
      await payload.create({
        collection: 'tableStandardSettings',
        data: { tableName, standardSource } as never,
        overrideAccess: true,
        req,
      })
    }
    applied += 1
  }
  return { applied }
}

function parseQuery(sp: URLSearchParams | undefined): TableSettingsQuery {
  return {
    category: sp?.get('category') || undefined,
    source: sp?.get('source') || undefined,
    keyword: sp?.get('keyword') || undefined,
  }
}

function tablesCsvRows(result: TableSettingsResult): string[][] {
  return [
    ['테이블명', '테이블구분', '테이블설명', '표준출처'],
    ...result.rows.map((r) => [r.tableName, r.tableCategory, r.tableDescription, r.standardSource]),
  ]
}

/* ── endpoint handlers (testable cores) ── */

export async function handleTableSettings(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_TABLE_SETTINGS_MENU_KEY))) return forbidden()
  const result = await loadTableStandardSettings(args.payload, {
    query: parseQuery(args.searchParams),
    req: args.req,
  })
  return Response.json(
    { ok: true, tableSettings: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function handleTableSettingsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_TABLE_SETTINGS_MENU_KEY))) return forbidden()
  const result = await loadTableStandardSettings(args.payload, {
    query: parseQuery(args.searchParams),
    req: args.req,
  })
  return csvResponse(csvDocument(tablesCsvRows(result)), 'table-standard-settings.csv')
}

export async function handleBatchApply(args: {
  payload: Payload
  req: PayloadRequest
  body?: { tableNames?: unknown; standardSource?: unknown }
}): Promise<Response> {
  if (!(await hasMenuAccess(args.req, STD_TABLE_SETTINGS_MENU_KEY))) return forbidden()
  const body = args.body ?? {}
  const tableNames = Array.isArray(body.tableNames) ? (body.tableNames as string[]) : []
  const standardSource = typeof body.standardSource === 'string' ? body.standardSource : ''
  if (!VALID_SOURCES.has(standardSource)) {
    return Response.json(
      { ok: false, message: `standardSource must be one of ${[...VALID_SOURCES].join(', ')}.` },
      { status: 400 },
    )
  }
  const result = await batchApplyTableSource(args.payload, {
    tableNames,
    standardSource,
    req: args.req,
  })
  return Response.json(
    { ok: true, ...result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export const tableStandardEndpoints: Endpoint[] = [
  {
    path: '/tables',
    method: 'get',
    handler: async (req) =>
      handleTableSettings({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/tables/export',
    method: 'get',
    handler: async (req) =>
      handleTableSettingsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/batch-apply',
    method: 'post',
    handler: async (req) => {
      const body = (await req.json?.()) ?? {}
      return handleBatchApply({ payload: req.payload, req, body })
    },
  },
]
