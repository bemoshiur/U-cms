import type { Payload, PayloadRequest } from 'payload'

import {
  buildErrorStatsPayload,
  type ErrorRow,
  type ErrorStatsPayload,
  type StatsGranularity,
} from '../content/errorStats'

/**
 * Shared read-side for the error statistics (Task 5C; refs 1-56..1-59). Loads
 * the `errorLogs` captured in a date range and assembles the 3-tab payload the
 * admin view renders and the CSV export serializes — a single source of truth so
 * the view, the CSV, and the drill-down never diverge.
 *
 * ## Scope: GLOBAL (not tenant-scoped)
 *
 * `errorLogs` is a system-wide admin store (legacy 오류 로그 is system-level, not
 * per-site), gated on `system.errorLogs`. There is no tenant dimension, so the
 * read applies no tenant `where`. The server-rendered view + the endpoints both
 * gate on `system.errorLogs` FIRST, then read with `overrideAccess: true` — the
 * gate is the access boundary, the read just fetches within the (already
 * authorized) range.
 */

/** Upper bound on rows scanned for one range — error volume is low; this caps a pathological range. */
export const ERROR_ROWS_SCAN_LIMIT = 5000

/** Maps a stored `errorLogs` doc to the pure {@link ErrorRow} shape. */
function toErrorRow(doc: Record<string, unknown>): ErrorRow {
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
  return {
    exceptionClass: str(doc.exceptionClass),
    url: str(doc.url),
    statusCode: typeof doc.statusCode === 'number' ? doc.statusCode : null,
    occurredAt: str(doc.occurredAt),
    actorLabel: str(doc.actorLabel),
    message: str(doc.message),
  }
}

/**
 * Loads the `errorLogs` rows whose `occurredAt` falls in `[from, to]` (inclusive
 * calendar days), newest first, capped at {@link ERROR_ROWS_SCAN_LIMIT}. `from`
 * and `to` are `YYYY-MM-DD`; they are widened to the full UTC day so the whole
 * `to` day is included.
 */
export async function loadErrorRows(
  payload: Payload,
  args: {
    from: string
    to: string
    req?: PayloadRequest
    overrideAccess?: boolean
    user?: unknown
  },
): Promise<ErrorRow[]> {
  const { from, to, req, overrideAccess = true, user } = args
  const found = await payload.find({
    collection: 'errorLogs',
    where: {
      and: [
        { occurredAt: { greater_than_equal: `${from}T00:00:00.000Z` } },
        { occurredAt: { less_than_equal: `${to}T23:59:59.999Z` } },
      ],
    },
    sort: '-occurredAt',
    depth: 0,
    limit: ERROR_ROWS_SCAN_LIMIT,
    pagination: false,
    overrideAccess,
    user: user as PayloadRequest['user'],
    req,
  })
  return found.docs.map((d) => toErrorRow(d as unknown as Record<string, unknown>))
}

/** Assembles the 3-tab payload from a set of error rows (pure composition wrapper). */
export function buildErrorStats(
  rows: ErrorRow[],
  args: { from: string; to: string; granularity: StatsGranularity },
): ErrorStatsPayload {
  return buildErrorStatsPayload(rows, args)
}
