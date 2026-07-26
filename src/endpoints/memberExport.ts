import type { Endpoint, Payload, PayloadRequest, Where } from 'payload'

import { hasMenuAccess } from '../access/hasMenuAccess'
import { MEMBERS_MENU_KEY } from '../access/memberAccess'
import { PERSONAL_INFO_LOGS_MENU_KEY } from './personalInfoLogsExport'
import { recordPersonalInfoAccess } from '../audit/recordPersonalInfoAccess'
import type { PersonalInfoPurposeCategory } from '../audit/recordPersonalInfoAccess'
import { maskEmail, maskId, maskName } from '../lib/mask'

/**
 * Purpose-gated MEMBER CSV export (Task 6A Part 3; refs 1-36 callout 2/4,
 * 3-8 callout 6). ANY export of member personal information MUST be gated by a
 * purpose the admin enters BEFORE the export runs, and that purpose is recorded
 * as immutable evidence in `personalInfoAccessLogs` (action `export`). NO
 * purpose → NO export, enforced SERVER-SIDE (a missing/blank purpose is rejected
 * with 400 — the UI purpose-modal is not the enforcement point; a scripted
 * caller cannot skip it).
 *
 *   POST /api/members/export   body: { purpose, purposeCategory?, siteId?, keyword? }
 *
 * A POST (not GET) so the purpose travels in the body (the modal submits it),
 * and so a purpose is never left in a shareable URL / browser history.
 *
 * ## Access + what exports to whom
 *
 * Gated on `members.manage` (member management is the reason to export) AND
 * tenant-scoped: the members are read under the CALLER's own access
 * (`overrideAccess: false`), so a non-super admin exports only the members of
 * the sites they are assigned to (`isSuper` exports all) — the same
 * `memberSelfOrManageAccess` scope the collection enforces everywhere.
 *
 * FIELD-LEVEL disclosure is tiered by the PRIVACY-OFFICER grant:
 *  - a `members.manage` admin WITHOUT `privacy.personalInfoLogs` → the PII
 *    columns (loginId / name / email / mobile) are MASKED (same masking as the
 *    admin list views);
 *  - a privacy officer (holds `privacy.personalInfoLogs`) → FULL, unmasked PII.
 * Either way the export is logged with the purpose. Non-PII columns (number,
 * status, join date, last access, site) are always in the clear.
 */

const EXPORT_MAX = 10000

/** Quotes a CSV cell and neutralizes leading formula characters (=,+,-,@). */
function csvCell(value: string): string {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${neutralized.replace(/"/g, '""')}"`
}

function csvDocument(rows: string[][]): string {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  return `﻿${body}\r\n` // UTF-8 BOM so Excel opens Korean/Unicode correctly.
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

const VALID_CATEGORIES: PersonalInfoPurposeCategory[] = [
  'view',
  'edit',
  'export',
  'inquiry_response',
  'complaint_handling',
  'other',
]

export type MemberExportInput = {
  purpose?: unknown
  purposeCategory?: unknown
  siteId?: unknown
  keyword?: unknown
}

/** Reads the export input from the request body (POST) with a query-string fallback. */
function readInput(req: PayloadRequest): MemberExportInput {
  const data = (req.data ?? {}) as Record<string, unknown>
  const sp = req.searchParams
  return {
    purpose: data.purpose ?? sp?.get('purpose') ?? undefined,
    purposeCategory: data.purposeCategory ?? sp?.get('purposeCategory') ?? undefined,
    siteId: data.siteId ?? sp?.get('siteId') ?? undefined,
    keyword: data.keyword ?? sp?.get('keyword') ?? undefined,
  }
}

type MemberRow = {
  id: string | number
  loginId?: unknown
  name?: unknown
  email?: unknown
  mobile?: unknown
  status?: unknown
  createdAt?: unknown
  lastLoginAt?: unknown
  tenant?: unknown
}

/** Builds the export CSV rows; masks the PII columns unless `fullPii`. */
export function memberRowsToCsv(rows: MemberRow[], fullPii: boolean): string[][] {
  const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
  const idOf = (t: unknown): string => {
    if (t && typeof t === 'object' && 'id' in (t as Record<string, unknown>)) {
      return String((t as { id: unknown }).id)
    }
    return s(t)
  }
  const header = [
    'No.',
    'Login ID',
    'Name',
    'Email',
    'Mobile',
    'Status',
    'Join date',
    'Last access',
    'Site',
  ]
  return [
    header,
    ...rows.map((m, i) => [
      String(i + 1),
      fullPii ? s(m.loginId) : maskId(s(m.loginId)),
      fullPii ? s(m.name) : maskName(s(m.name)),
      fullPii ? s(m.email) : maskEmail(s(m.email)),
      fullPii ? s(m.mobile) : maskId(s(m.mobile)),
      s(m.status),
      s(m.createdAt),
      s(m.lastLoginAt),
      idOf(m.tenant),
    ]),
  ]
}

/**
 * The purpose-gated member export core (testable). ORDER MATTERS:
 *  1. reject a missing/blank purpose (400) — before anything else;
 *  2. enforce the `members.manage` grant (403);
 *  3. record the personal-info audit row WITH the purpose (evidence) FIRST;
 *  4. THEN read (tenant-scoped, under the caller) and produce the CSV.
 */
export async function handleMemberExport(args: {
  payload: Payload
  req: PayloadRequest
}): Promise<Response> {
  const { payload, req } = args
  const input = readInput(req)

  // (1) SERVER-ENFORCED purpose gate — no purpose, no export.
  const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : ''
  if (!purpose) {
    return Response.json(
      {
        ok: false,
        message: 'A purpose (열람목적) is required before member data can be exported.',
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

  // (2) Access: member-management grant required.
  if (!(await hasMenuAccess(req, MEMBERS_MENU_KEY))) {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }
  const fullPii = await hasMenuAccess(req, PERSONAL_INFO_LOGS_MENU_KEY)

  // Optional filters (tenant scope is enforced by the caller-scoped read below).
  const and: Where[] = []
  const hasSiteId = input.siteId !== undefined && input.siteId !== null && input.siteId !== ''
  const siteId = hasSiteId ? String(input.siteId) : ''
  if (hasSiteId) {
    // Pass the raw value (number in a JSON body, string from a query) so the
    // adapter matches the integer tenant relationship without a cast mismatch.
    and.push({ tenant: { equals: input.siteId as string | number } })
  }
  const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : ''
  if (keyword) {
    and.push({
      or: [
        { name: { like: keyword } },
        { loginId: { like: keyword } },
        { email: { like: keyword } },
      ],
    })
  }
  const where: Where = and.length > 0 ? { and } : {}

  // (3) Record the purpose FIRST — immutable evidence, even if the read below
  // returns nothing. subjectMemberId '*' denotes a bulk export (no single subject).
  await recordPersonalInfoAccess(payload, {
    req,
    viewer: req.user,
    subjectLabel: '(bulk member export)',
    subjectMemberId: '*',
    subjectSiteId: siteId || undefined,
    screen: 'member-list-export',
    url: req.pathname,
    action: 'export',
    purposeCategory,
    purposeDetail: purpose,
  })

  // (4) Read the members UNDER THE CALLER's access (tenant-scoped + members.manage
  // enforced by the collection). A missing grant would throw → mapped to 403.
  let docs: MemberRow[]
  try {
    const found = await payload.find({
      collection: 'members',
      where,
      sort: 'createdAt',
      limit: EXPORT_MAX,
      pagination: false,
      depth: 0,
      overrideAccess: false,
      user: req.user,
      req,
    })
    docs = found.docs as unknown as MemberRow[]
  } catch {
    return Response.json({ ok: false, message: 'Forbidden.' }, { status: 403 })
  }

  return csvResponse(csvDocument(memberRowsToCsv(docs, fullPii)), 'members.csv')
}

export const memberExportEndpoints: Endpoint[] = [
  {
    path: '/export',
    method: 'post',
    handler: async (req) => handleMemberExport({ payload: req.payload, req }),
  },
]
