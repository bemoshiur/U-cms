import type { Payload } from 'payload'

import { resolveActorLabel } from '../audit/helpers'
import { toRelationId } from '../collections/utils'

/**
 * Member-detail WATERMARK data derivation (Task 6B Part 1; feature-inventory
 * ref 1-37). The legacy Integrated Member Management screen paints a diagonal,
 * repeated, semi-transparent watermark over the member-detail content carrying
 * the VIEWER's identity, the access TIMESTAMP, and a per-view MANAGEMENT/tracking
 * NUMBER — an anti-exfiltration deterrent: a screenshot or printout of a
 * member's personal information carries, indelibly, WHO looked and WHEN.
 *
 * ## Non-spoofable by construction
 *
 * Every field here is SERVER-DERIVED and can never be set/forged by the client:
 *  - the VIEWER is `req.user` (the authenticated admin), resolved to the same
 *    denormalized `name(loginId)` label the audit log stores;
 *  - the TIMESTAMP and MANAGEMENT NUMBER are taken from the immutable
 *    `personalInfoAccessLogs` row that Task 6A's non-bypassable `afterRead`
 *    hook wrote for THIS very view (its row id and `occurredAt`), so the mgmt#
 *    on a leaked screenshot resolves back to the exact audit record of the
 *    access. When (rarely) that row cannot be found yet, a DETERMINISTIC
 *    composed id is derived server-side from the member id + viewer id +
 *    server time — still un-forgeable, still traceable.
 *
 * The functions below are split so the derivation is unit-testable without React
 * or a database (`buildMemberWatermarkData`, `composeMgmtNo`,
 * `formatWatermarkTimestamp` are pure); `resolveMemberWatermark` is the thin DB
 * seam the server component uses.
 */

export type MemberWatermarkData = {
  /** The viewer's denormalized `name(loginId)` label (their OWN identity — see note). */
  viewerLabel: string
  /** The viewer's raw id as text. */
  viewerId: string
  /** The per-view management/tracking number (`PIA-<logId>` or a composed code). */
  mgmtNo: string
  /** The access timestamp, `YYYY-MM-DD HH:mm:ss UTC`. */
  timestamp: string
  /** The single-line tile text repeated across the overlay. */
  text: string
}

/** Zero-pads a number to 2 digits. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Coerces a Date/ISO-string/anything to a valid Date, defaulting to now. */
function toDate(value: Date | string | undefined): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === 'string') {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) {
      return d
    }
  }
  return new Date()
}

/** Formats an access time as a stable, timezone-explicit `YYYY-MM-DD HH:mm:ss UTC`. */
export function formatWatermarkTimestamp(value: Date | string | undefined): string {
  const d = toDate(value)
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  const time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`
  return `${date} ${time} UTC`
}

/**
 * Deterministic composed management number used when the audit-log row id is not
 * (yet) available. Server-derived from the subject member id + viewer id + the
 * access time (`PIA-M<memberId>-U<viewerId>-<yyyymmddHHmmss>`), so it is stable
 * for a given access and can never be forged by the client.
 */
export function composeMgmtNo(args: {
  memberId: string | number
  viewerId: string | number | undefined
  at: Date | string | undefined
}): string {
  const d = toDate(args.at)
  const stamp = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(
    d.getUTCHours(),
  )}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`
  const viewer = args.viewerId === undefined ? 'anon' : String(args.viewerId)
  return `PIA-M${String(args.memberId)}-U${viewer}-${stamp}`
}

/**
 * Pure assembly of the watermark payload from already-resolved inputs. Prefers
 * the real `personalInfoAccessLogs` row id (`PIA-<logId>`) as the management
 * number — tying the on-screen mgmt# to the immutable audit record of THIS
 * access — and falls back to the deterministic composed id otherwise.
 *
 * NOTE on the viewer label: this is the viewer's OWN identity (the admin doing
 * the looking), shown in full ON PURPOSE. It is not a third party's PII; it is
 * the actor's signature on the disclosure, which is the entire point of the
 * deterrent — a leaked screenshot must identify who leaked it. (Third-party
 * member PII is masked everywhere it is not the audited detail read — Task 6A.)
 */
export function buildMemberWatermarkData(args: {
  viewer: unknown
  memberId: string | number
  accessLogId?: string | number | null
  occurredAt?: Date | string
}): MemberWatermarkData {
  const viewerRawId = toRelationId(args.viewer)
  const viewerId = viewerRawId === undefined ? '' : String(viewerRawId)
  const viewerLabel = resolveActorLabel(args.viewer) ?? (viewerId || 'unknown viewer')
  const timestamp = formatWatermarkTimestamp(args.occurredAt)
  const mgmtNo =
    args.accessLogId !== undefined && args.accessLogId !== null && args.accessLogId !== ''
      ? `PIA-${String(args.accessLogId)}`
      : composeMgmtNo({ memberId: args.memberId, viewerId: viewerRawId, at: args.occurredAt })
  const text = `${viewerLabel} · ${timestamp} · ${mgmtNo}`
  return { viewerLabel, viewerId, mgmtNo, timestamp, text }
}

/**
 * DB seam: resolves the watermark for a member-detail view. Looks up the most
 * recent `view` audit row for this (viewer, subject-member) pair — the row Task
 * 6A's `afterRead` capture wrote for this very access — and uses its id +
 * `occurredAt`; if unavailable it degrades to the deterministic composed id and
 * server `now`. Reads with `overrideAccess: true` because the member-detail view
 * that mounts this component is itself the already-authorized, already-audited
 * full-PII screen; never throws (a watermark must never break the page).
 */
export async function resolveMemberWatermark(
  payload: Payload,
  args: { viewer: unknown; memberId: string | number },
): Promise<MemberWatermarkData> {
  const viewerId = toRelationId(args.viewer)
  let accessLogId: string | number | null | undefined
  let occurredAt: string | undefined
  try {
    const and: Record<string, unknown>[] = [
      { subjectMemberId: { equals: String(args.memberId) } },
      { action: { equals: 'view' } },
    ]
    if (viewerId !== undefined) {
      and.push({ viewerId: { equals: String(viewerId) } })
    }
    const found = await payload.find({
      collection: 'personalInfoAccessLogs',
      where: { and } as never,
      sort: '-occurredAt',
      limit: 1,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const row = found.docs[0] as { id?: unknown; occurredAt?: unknown } | undefined
    accessLogId = (row?.id as string | number | undefined) ?? undefined
    occurredAt = typeof row?.occurredAt === 'string' ? row.occurredAt : undefined
  } catch {
    // Fall through to the composed id + server now.
  }
  return buildMemberWatermarkData({
    viewer: args.viewer,
    memberId: args.memberId,
    accessLogId,
    occurredAt,
  })
}
