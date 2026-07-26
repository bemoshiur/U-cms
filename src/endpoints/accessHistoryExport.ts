import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import {
  ACCESS_HISTORY_MAX_LIMIT,
  ACCESS_HISTORY_MENU_KEY,
  type AccessHistoryQuery,
  type AccessHistoryResult,
  loadAccessHistory,
} from '../site/accessHistoryData'

/**
 * Site access-history data + CSV export endpoints (Task 5C Part 2; ref 2-20).
 * Collection endpoints on `accessLogs`:
 *
 *   GET /api/accessLogs/history?from&to&keyword&page&limit → JSON (masked, paginated)
 *   GET /api/accessLogs/history/export?from&to&keyword     → CSV  (masked)
 *
 * ACCESS-GATED on `privacy.accessLogs` (else 403). Both the JSON rows and the
 * CSV are PII-MASKED (actor label + IP) — this is the masked access-history VIEW
 * over the existing audit log, not the raw collection (see `accessHistoryData.ts`
 * for the scope + masking rationale). `Cache-Control: private, no-store`,
 * mirroring the other stat exports.
 */

export { ACCESS_HISTORY_MENU_KEY }

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

/** Parses the shared query from the URL search params (dates validated downstream). */
function parseQuery(sp: URLSearchParams | undefined): AccessHistoryQuery {
  const num = (v: string | null): number | undefined => {
    const n = v ? Number(v) : NaN
    return Number.isFinite(n) ? n : undefined
  }
  return {
    from: sp?.get('from') ?? undefined,
    to: sp?.get('to') ?? undefined,
    keyword: sp?.get('keyword') ?? undefined,
    page: num(sp?.get('page') ?? null),
    limit: num(sp?.get('limit') ?? null),
  }
}

/** Resolves the access-gated, masked access-history page, or an error `Response`. */
async function resolveHistory(args: {
  payload: Payload
  req: PayloadRequest
  query: AccessHistoryQuery
  overrideAccess: boolean
}): Promise<AccessHistoryResult | Response> {
  const { payload, req, query, overrideAccess } = args
  if (!(await hasMenuAccess(req, ACCESS_HISTORY_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  return loadAccessHistory(payload, { query, req, overrideAccess, user: req.user })
}

/** JSON access-history endpoint handler (testable core). Reads under the caller's own access. */
export async function handleAccessHistory(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const result = await resolveHistory({
    payload: args.payload,
    req: args.req,
    query: parseQuery(args.searchParams),
    overrideAccess: false,
  })
  if (result instanceof Response) {
    return result
  }
  return Response.json(
    { ok: true, history: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/** Builds the masked CSV rows for the access history. */
export function accessHistoryToCsvRows(result: AccessHistoryResult): string[][] {
  return [
    ['When', 'Actor (masked)', 'Action', 'Menu', 'URL', 'IP (masked)'],
    ...result.rows.map((r) => [
      r.createdAt ?? '',
      r.actorLabelMasked,
      r.action ?? '',
      r.menuLabel ?? '',
      r.url ?? '',
      r.ipAddressMasked,
    ]),
  ]
}

/** CSV export endpoint handler (testable core). Exports up to one max-size page (masked). */
export async function handleAccessHistoryExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const query = parseQuery(args.searchParams)
  // Export a single, bounded max-size page (the masked view's rows), so a huge
  // history can't produce an unbounded CSV.
  const result = await resolveHistory({
    payload: args.payload,
    req: args.req,
    query: { ...query, page: 1, limit: ACCESS_HISTORY_MAX_LIMIT },
    overrideAccess: false,
  })
  if (result instanceof Response) {
    return result
  }
  return csvResponse(csvDocument(accessHistoryToCsvRows(result)), 'access-history.csv')
}

export const accessHistoryEndpoints: Endpoint[] = [
  {
    path: '/history',
    method: 'get',
    handler: async (req) =>
      handleAccessHistory({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/history/export',
    method: 'get',
    handler: async (req) =>
      handleAccessHistoryExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
