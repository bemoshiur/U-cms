import type { Payload, PayloadRequest, Where } from 'payload'

import { maskIp, maskLabel } from '../lib/mask'

/**
 * Shared read-side for the site access-history view (Task 5C Part 2; ref 2-20).
 * A VIEW over the EXISTING `accessLogs` (Phase-2 audit backbone) — who accessed
 * what, when, from where — with a date range + keyword search + pagination. One
 * source of truth so the admin view and the CSV export apply the SAME filter and
 * the SAME PII masking.
 *
 * ## Scope: the ADMIN back-office access history (system-wide), documented
 *
 * `accessLogs` records ADMIN actions (login/logout + every collection mutation)
 * and carries NO site/tenant dimension — an admin action isn't inherently tied
 * to one site (an admin may manage several, and the global collections
 * users/roles/sites aren't per-site at all). So this is the SYSTEM-WIDE admin
 * access history, gated on the existing `privacy.accessLogs` grant; it is NOT
 * per-public-site. No field was added to `accessLogs` (re-capturing a site
 * dimension onto system-wide admin actions would be incorrect); the limitation
 * is documented rather than papered over. The public-visitor "site access log"
 * (raw IP per legacy 2-20) is deliberately NOT rebuilt — Phase-4/5 replaced it
 * with the PII-free traffic capture (see `src/content/traffic.ts`).
 *
 * ## PII masking (display + export)
 *
 * The stored `actorLabel` + `ipAddress` are the REAL values (non-repudiation).
 * This view is the privacy-masked presentation of them (ref 2-20 "from where
 * (masked)"), so both the rendered rows AND the CSV export mask the actor label
 * and IP via `src/lib/mask.ts`. The raw values remain in the `accessLogs`
 * collection for a grant holder who genuinely needs them.
 */

export const ACCESS_HISTORY_MENU_KEY = 'privacy.accessLogs'
export const ACCESS_HISTORY_DEFAULT_LIMIT = 25
export const ACCESS_HISTORY_MAX_LIMIT = 200

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type AccessHistoryQuery = {
  from?: string
  to?: string
  keyword?: string
  page?: number
  limit?: number
}

/** A masked access-history row as rendered/exported (never carries the raw actor/IP). */
export type AccessHistoryRow = {
  id: string | number
  createdAt: string | null
  actorLabelMasked: string
  action: string | null
  menuLabel: string | null
  url: string | null
  ipAddressMasked: string
}

export type AccessHistoryResult = {
  rows: AccessHistoryRow[]
  total: number
  page: number
  totalPages: number
  limit: number
}

/**
 * Builds the `accessLogs` `Where` from the query: a `createdAt` range (each
 * `YYYY-MM-DD` widened to the full UTC day) AND a keyword OR-match across the
 * searchable text columns (actor / url / ip / menu label / action). An invalid
 * date is ignored (open on that side); a blank keyword adds no term.
 */
export function buildAccessHistoryWhere(query: AccessHistoryQuery): Where {
  const and: Where[] = []
  if (query.from && DATE_RE.test(query.from)) {
    and.push({ createdAt: { greater_than_equal: `${query.from}T00:00:00.000Z` } })
  }
  if (query.to && DATE_RE.test(query.to)) {
    and.push({ createdAt: { less_than_equal: `${query.to}T23:59:59.999Z` } })
  }
  const kw = query.keyword?.trim()
  if (kw) {
    // OR-match across the free-TEXT columns only. `action` is a Postgres enum
    // (not text), so `like` is invalid on it — it is filtered via the list view's
    // native select filter instead, not the keyword box.
    and.push({
      or: [
        { actorLabel: { like: kw } },
        { url: { like: kw } },
        { ipAddress: { like: kw } },
        { menuLabel: { like: kw } },
      ],
    })
  }
  return and.length > 0 ? { and } : {}
}

/** Clamps a requested page size into `[1, ACCESS_HISTORY_MAX_LIMIT]`. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit < 1) {
    return ACCESS_HISTORY_DEFAULT_LIMIT
  }
  return Math.min(Math.floor(limit), ACCESS_HISTORY_MAX_LIMIT)
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/**
 * Loads one page of masked access-history rows for the query, newest first. The
 * server-rendered view passes `overrideAccess: true` (its own gate already
 * authorized the caller); the endpoints read under the caller's own access
 * (`overrideAccess: false`) so the collection's `privacy.accessLogs` read gate
 * still applies.
 */
export async function loadAccessHistory(
  payload: Payload,
  args: {
    query: AccessHistoryQuery
    req?: PayloadRequest
    overrideAccess?: boolean
    user?: unknown
  },
): Promise<AccessHistoryResult> {
  const { query, req, overrideAccess = true, user } = args
  const limit = clampLimit(query.limit)
  const page = query.page && query.page > 0 ? Math.floor(query.page) : 1

  const found = await payload.find({
    collection: 'accessLogs',
    where: buildAccessHistoryWhere(query),
    sort: '-createdAt',
    depth: 0,
    page,
    limit,
    overrideAccess,
    user: user as PayloadRequest['user'],
    req,
  })

  const rows: AccessHistoryRow[] = (found.docs as unknown as Record<string, unknown>[]).map((d) => {
    const actorLabel = str(d.actorLabel)
    const ip = str(d.ipAddress)
    return {
      id: d.id as string | number,
      createdAt: str(d.createdAt),
      actorLabelMasked: actorLabel ? maskLabel(actorLabel) : '',
      action: str(d.action),
      menuLabel: str(d.menuLabel),
      url: str(d.url),
      ipAddressMasked: ip ? maskIp(ip) : '',
    }
  })

  return {
    rows,
    total: found.totalDocs,
    page: found.page ?? page,
    totalPages: found.totalPages ?? 1,
    limit,
  }
}
