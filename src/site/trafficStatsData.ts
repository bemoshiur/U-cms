import type { Payload, PayloadRequest } from 'payload'

import {
  aggregateRange,
  type Breakdown,
  type DailyRollup,
  dimensionTotals,
  type PathBreakdown,
  type PeriodPoint,
  periodSeries,
  topPages,
} from '../content/trafficStats'

/**
 * Shared read-side for the traffic statistics (Task 5A; TODO 5.2). Loads a
 * site's `trafficDaily` rollups for a date range and assembles the 5-tab payload
 * the admin view renders and the export endpoints serialize. Single source of
 * truth so the view and the CSV never diverge, and so tenant scoping is applied
 * the SAME way in both (a scoped `find` under the caller's access — see the
 * endpoints — or `overrideAccess` for the server-rendered admin view whose own
 * gate already decided access).
 */

export type StatsGranularity = 'daily' | 'monthly'

export type TrafficStatsPayload = {
  from: string
  to: string
  granularity: StatsGranularity
  /** Whole-range totals — the PV / unique-visitor headline. */
  totalViews: number
  uniqueVisitors: number
  /** Tab 1 — PV + unique visitors over time (daily or monthly). */
  period: PeriodPoint[]
  /** Tab 2 — top pages/menus by PV. */
  menu: PathBreakdown[]
  /** Tab 3 — OS families. */
  os: Breakdown[]
  /** Tab 4 — browser families. */
  browser: Breakdown[]
  /** Tab 5 — device classes. */
  device: Breakdown[]
}

/** Maps a stored `trafficDaily` doc to the pure {@link DailyRollup} shape. */
function toDailyRollup(doc: Record<string, unknown>): DailyRollup {
  const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    date: typeof doc.date === 'string' ? doc.date : '',
    totalViews: typeof doc.totalViews === 'number' ? doc.totalViews : 0,
    uniqueVisitors: typeof doc.uniqueVisitors === 'number' ? doc.uniqueVisitors : 0,
    byPath: arr<PathBreakdown>(doc.byPath),
    byOs: arr<Breakdown>(doc.byOs),
    byBrowser: arr<Breakdown>(doc.byBrowser),
    byDevice: arr<Breakdown>(doc.byDevice),
  }
}

/**
 * Loads the `trafficDaily` rollups for `[from, to]` on one site, sorted by date.
 * When `user` is given (endpoints) the read runs under that user's tenant-scoped
 * access (`overrideAccess: false`) so cross-tenant rows are filtered out; the
 * server-rendered admin view passes `overrideAccess: true` because its own gate
 * has already authorized the caller + site.
 */
export async function loadDailyRollups(
  payload: Payload,
  args: {
    tenantId: string | number
    from: string
    to: string
    user?: unknown
    overrideAccess?: boolean
    req?: PayloadRequest
  },
): Promise<DailyRollup[]> {
  const { tenantId, from, to, user, overrideAccess = false, req } = args
  const found = await payload.find({
    collection: 'trafficDaily',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { date: { greater_than_equal: from } },
        { date: { less_than_equal: to } },
      ],
    },
    sort: 'date',
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess,
    user: user as PayloadRequest['user'],
    req,
  })
  return found.docs.map((d) => toDailyRollup(d as unknown as Record<string, unknown>))
}

/** Assembles the 5-tab payload from a set of daily rollups (pure composition). */
export function buildStatsPayload(
  dailies: DailyRollup[],
  args: { from: string; to: string; granularity: StatsGranularity; topPagesLimit?: number },
): TrafficStatsPayload {
  const range = aggregateRange(dailies)
  return {
    from: args.from,
    to: args.to,
    granularity: args.granularity,
    totalViews: range.totalViews,
    uniqueVisitors: range.uniqueVisitors,
    period: periodSeries(dailies, args.granularity),
    menu: topPages(dailies, args.topPagesLimit ?? 20),
    os: dimensionTotals(dailies, 'os'),
    browser: dimensionTotals(dailies, 'browser'),
    device: dimensionTotals(dailies, 'device'),
  }
}
