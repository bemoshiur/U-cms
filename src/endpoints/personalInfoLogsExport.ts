import type { Endpoint, Payload, PayloadRequest, Where } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import { maskIp, maskLabel } from '../lib/mask'
import { recordPersonalInfoAccess } from '../audit/recordPersonalInfoAccess'
import type { PersonalInfoPurposeCategory } from '../audit/recordPersonalInfoAccess'

/**
 * CSV export of the personal-info access log ITSELF (Task 6A Part 1, Audit
 * Fix 4; ref 3-8 callout 5 — '개인정보 열람이력 엑셀다운'). This "log-of-logs" is
 * a personal-info-adjacent export, so it is gated on the SAME
 * `privacy.personalInfoLogs` grant that guards reading the collection, and its
 * viewer/subject labels + IP are MASKED in the output (display-only masking,
 * matching the collection's list-view Cells). The privacy officer uses this to
 * hand the audit trail to an auditor without leaking the raw identities.
 *
 * Like the sibling `POST /api/members/export` (`memberExport.ts`), this
 * export is PURPOSE-GATED (Audit Fix 4; ref 3-8 callout 5-6): a missing/blank
 * `purpose` is rejected with 400 BEFORE anything else, and a valid purpose is
 * recorded as an immutable "audit-of-audits" evidence row (action `export`)
 * in THIS SAME collection before the CSV is produced — exporting the
 * access-history log is itself a personal-info-adjacent access that must be
 * justified and logged, exactly like the member export.
 *
 *   POST /api/personalInfoAccessLogs/history/export
 *     body: { purpose, purposeCategory?, from?, to?, keyword?, action? } → CSV (masked)
 *
 * A POST (not GET) so the purpose travels in the body (the modal submits it),
 * and so a purpose is never left in a shareable URL / browser history.
 *
 * `Cache-Control: private, no-store`, mirroring the other stat/audit exports.
 */

export const PERSONAL_INFO_LOGS_MENU_KEY = 'privacy.personalInfoLogs'

/** Cap the exported rows so a huge history can't produce an unbounded CSV. */
const PERSONAL_INFO_LOGS_EXPORT_MAX = 5000

/** Same purpose-category set the collection's own `purposeCategory` field defines. */
const VALID_CATEGORIES: PersonalInfoPurposeCategory[] = [
  'view',
  'edit',
  'export',
  'inquiry_response',
  'complaint_handling',
  'other',
]

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

export type PersonalInfoLogsExportInput = {
  from?: unknown
  to?: unknown
  keyword?: unknown
  action?: unknown
  purpose?: unknown
  purposeCategory?: unknown
}

/**
 * Reads the export input from the POST JSON body, with a query-string
 * fallback. Mirrors `memberExport.ts`'s `readInput`: Payload's custom-endpoint
 * dispatcher does NOT populate `req.data` for a POST, so the body MUST be read
 * via `req.json()`.
 */
async function readInput(req: PayloadRequest): Promise<PersonalInfoLogsExportInput> {
  const body = (await req.json?.().catch(() => ({}))) as Record<string, unknown> | undefined
  const data = body ?? {}
  const sp = req.searchParams
  const pick = (key: string): unknown => data[key] ?? sp?.get(key) ?? undefined
  return {
    from: pick('from'),
    to: pick('to'),
    keyword: pick('keyword'),
    action: pick('action'),
    purpose: pick('purpose'),
    purposeCategory: pick('purposeCategory'),
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

/**
 * The purpose-gated log-of-logs export core (testable). ORDER MATTERS,
 * mirroring `handleMemberExport` exactly:
 *  1. reject a missing/blank purpose (400) — before anything else;
 *  2. enforce the `privacy.personalInfoLogs` grant (403);
 *  3. record the personal-info audit-of-audits row WITH the purpose
 *     (evidence) FIRST — an un-guarded `await`, same posture as
 *     `memberExport.ts` (a throw here aborts the whole handler; the write
 *     itself never throws — `recordPersonalInfoAccess` swallows failures
 *     internally and logs them, so this call has the same effective
 *     behavior as the sibling export for consistency);
 *  4. THEN read + produce the CSV.
 */
export async function handlePersonalInfoLogsExport(args: {
  payload: Payload
  req: PayloadRequest
}): Promise<Response> {
  const { payload, req } = args
  const input = await readInput(req)

  // (1) SERVER-ENFORCED purpose gate — no purpose, no export.
  const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : ''
  if (!purpose) {
    return Response.json(
      {
        ok: false,
        message: 'A purpose (열람목적) is required before the access history can be exported.',
      },
      { status: 400 },
    )
  }
  const categoryRaw = typeof input.purposeCategory === 'string' ? input.purposeCategory : 'export'
  const purposeCategory: PersonalInfoPurposeCategory = VALID_CATEGORIES.includes(
    categoryRaw as PersonalInfoPurposeCategory,
  )
    ? (categoryRaw as PersonalInfoPurposeCategory)
    : 'export'

  // (2) Access: the same privacy-officer grant that guards reading the log.
  if (!(await hasMenuAccess(req, PERSONAL_INFO_LOGS_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }

  // (3) Record the purpose FIRST — immutable "audit-of-audits" evidence that
  // this export of the access-history log itself happened, even if the read
  // below returns nothing. subjectMemberId '*' denotes a bulk/self-referential
  // export (no single subject — the subject IS the log).
  await recordPersonalInfoAccess(payload, {
    req,
    viewer: req.user,
    subjectLabel: '(access-history export)',
    subjectMemberId: '*',
    screen: 'personal-info-log-export',
    url: req.pathname,
    action: 'export',
    purposeCategory,
    purposeDetail: purpose,
  })

  // (4) Build the `Where` from the same filters, now sourced from the POST
  // body (with a query-string fallback), and produce the CSV exactly as before.
  const query: Query = {
    from: typeof input.from === 'string' ? input.from : undefined,
    to: typeof input.to === 'string' ? input.to : undefined,
    keyword: typeof input.keyword === 'string' ? input.keyword : undefined,
    action: typeof input.action === 'string' ? input.action : undefined,
  }
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
    method: 'post',
    handler: async (req) => handlePersonalInfoLogsExport({ payload: req.payload, req }),
  },
]
