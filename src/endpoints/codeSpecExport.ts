import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import {
  STD_CODE_SPEC_MENU_KEY,
  type CodeSpecQuery,
  type CodeSpecResult,
  loadCodeSpec,
} from '../site/codeSpecData'

/**
 * Code Specification report data + CSV export endpoints (Phase 8, Task 8.1a;
 * ref 1-74). Mounted on the `codes` collection:
 *
 *   GET /api/codes/code-spec?classification&keyword         → JSON (report rows)
 *   GET /api/codes/code-spec/export?classification&keyword  → CSV  (전체엑셀다운로드)
 *
 * ACCESS-GATED on `standardization.codeSpec` (the DBA grant), INDEPENDENT of the
 * `codes` collection's own `system.codes.detail` gate — a DBA sees the audit
 * report without holding raw code-management rights, and vice-versa. Mirrors the
 * dependency-free CSV pattern in `errorStatsExport.ts`: `csvCell` quotes and
 * neutralizes leading formula chars (= + - @); the response is
 * `Cache-Control: private, no-store`. CSV opens in Excel — no xlsx dependency.
 */

export { STD_CODE_SPEC_MENU_KEY }

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

/** Parses the shared query from the URL search params. */
function parseQuery(sp: URLSearchParams | undefined): CodeSpecQuery {
  return {
    classification: sp?.get('classification') ?? undefined,
    keyword: sp?.get('keyword') ?? undefined,
  }
}

/** Resolves the access-gated report, or an error `Response`. */
async function resolveCodeSpec(args: {
  payload: Payload
  req: PayloadRequest
  query: CodeSpecQuery
}): Promise<CodeSpecResult | Response> {
  const { payload, req, query } = args
  if (!(await hasMenuAccess(req, STD_CODE_SPEC_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  return loadCodeSpec(payload, { query, req })
}

/** JSON report endpoint handler (testable core). */
export async function handleCodeSpec(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const result = await resolveCodeSpec({
    payload: args.payload,
    req: args.req,
    query: parseQuery(args.searchParams),
  })
  if (result instanceof Response) {
    return result
  }
  return Response.json(
    { ok: true, codeSpec: result },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/** Builds the CSV rows for the code specification report. */
export function codeSpecToCsvRows(result: CodeSpecResult): string[][] {
  return [
    ['분류', '구분', '코드ID', '상위코드', '코드', '코드명', '코드영문명', '등록일'],
    ...result.rows.map((r) => [
      r.classification,
      r.codeGroupName,
      r.codeId,
      r.parentCode,
      r.code,
      r.codeName,
      r.englishName,
      r.registeredAt,
    ]),
  ]
}

/** CSV export endpoint handler (testable core). */
export async function handleCodeSpecExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const result = await resolveCodeSpec({
    payload: args.payload,
    req: args.req,
    query: parseQuery(args.searchParams),
  })
  if (result instanceof Response) {
    return result
  }
  return csvResponse(csvDocument(codeSpecToCsvRows(result)), 'code-specification.csv')
}

export const codeSpecEndpoints: Endpoint[] = [
  {
    path: '/code-spec',
    method: 'get',
    handler: async (req) =>
      handleCodeSpec({ payload: req.payload, req, searchParams: req.searchParams }),
  },
  {
    path: '/code-spec/export',
    method: 'get',
    handler: async (req) =>
      handleCodeSpecExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
