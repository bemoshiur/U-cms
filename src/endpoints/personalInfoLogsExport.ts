import type { Endpoint, Payload, PayloadRequest, Where } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import { maskIp, maskLabel } from '../lib/mask'

/**
 * CSV export of the personal-info access log ITSELF (Task 6A Part 1; ref 3-8
 * callout 5 — '개인정보 열람이력 엑셀다운'). This "log-of-logs" is a
 * personal-info-adjacent export, so it is gated on the SAME
 * `privacy.personalInfoLogs` grant that guards reading the collection, and its
 * viewer/subject labels + IP are MASKED in the output (display-only masking,
 * matching the collection's list-view Cells). The privacy officer uses this to
 * hand the audit trail to an auditor without leaking the raw identities.
 *
 *   GET /api/personalInfoAccessLogs/history/export?from&to&keyword&action → CSV (masked)
 *
 * `Cache-Control: private, no-store`, mirroring the other stat/audit exports.
 */

export const PERSONAL_INFO_LOGS_MENU_KEY = 'privacy.personalInfoLogs'

/** Cap the exported rows so a huge history can't produce an unbounded CSV. */
const PERSONAL_INFO_LOGS_EXPORT_MAX = 5000

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

type Query = { from?: string; to?: string; keyword?: string; action?: string }

function parseQuery(sp: URLSearchParams | undefined): Query {
  return {
    from: sp?.get('from') ?? undefined,
    to: sp?.get('to') ?? undefined,
    keyword: sp?.get('keyword') ?? undefined,
    action: sp?.get('action') ?? undefined,
  }
}

/** Builds the `Where` for the log query (date range + keyword + action). */
export function buildPersonalInfoLogsWhere(query: Query): Where {
  const and: Where[] = []
  if (query.from) {
    and.push({ occurredAt: { greater_than_equal: query.from } })
  }
  if (query.to) {
    // Inclusive end-of-day.
    const to = query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to
    and.push({ occurredAt: { less_than_equal: to } })
  }
  if (query.action) {
    and.push({ action: { equals: query.action } })
  }
  if (query.keyword) {
    and.push({
      or: [
        { viewerLabel: { like: query.keyword } },
        { subjectLabel: { like: query.keyword } },
        { url: { like: query.keyword } },
        { screen: { like: query.keyword } },
      ],
    })
  }
  return and.length > 0 ? { and } : {}
}

/** Masked CSV rows for the personal-info access log. */
export function personalInfoLogsToCsvRows(
  docs: {
    occurredAt?: unknown
    viewerLabel?: unknown
    subjectLabel?: unknown
    screen?: unknown
    url?: unknown
    action?: unknown
    purposeCategory?: unknown
    purposeDetail?: unknown
    ipAddress?: unknown
    subjectSiteId?: unknown
  }[],
): string[][] {
  const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
  return [
    [
      'When',
      'Screen',
      'Subject (masked)',
      'Site',
      'URL',
      'Action',
      'Purpose category',
      'Purpose detail',
      'Viewer (masked)',
      'IP (masked)',
    ],
    ...docs.map((d) => [
      s(d.occurredAt),
      s(d.screen),
      maskLabel(s(d.subjectLabel)),
      s(d.subjectSiteId),
      s(d.url),
      s(d.action),
      s(d.purposeCategory),
      s(d.purposeDetail),
      maskLabel(s(d.viewerLabel)),
      maskIp(s(d.ipAddress)),
    ]),
  ]
}

/** CSV export handler (testable core). Gated on `privacy.personalInfoLogs`. */
export async function handlePersonalInfoLogsExport(args: {
  payload: Payload
  req: PayloadRequest
  searchParams?: URLSearchParams
}): Promise<Response> {
  const { payload, req } = args
  if (!(await hasMenuAccess(req, PERSONAL_INFO_LOGS_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  const query = parseQuery(args.searchParams)
  const found = await payload.find({
    collection: 'personalInfoAccessLogs',
    where: buildPersonalInfoLogsWhere(query),
    sort: '-occurredAt',
    limit: PERSONAL_INFO_LOGS_EXPORT_MAX,
    pagination: false,
    depth: 0,
    // Access already decided above; read the raw rows to mask them here.
    overrideAccess: true,
  })
  return csvResponse(
    csvDocument(personalInfoLogsToCsvRows(found.docs as never)),
    'personal-info-access-history.csv',
  )
}

export const personalInfoLogsEndpoints: Endpoint[] = [
  {
    path: '/history/export',
    method: 'get',
    handler: async (req) =>
      handlePersonalInfoLogsExport({ payload: req.payload, req, searchParams: req.searchParams }),
  },
]
