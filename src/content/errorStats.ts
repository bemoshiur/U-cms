/**
 * Pure error-statistics domain (Task 5C; refs 1-58/1-59). Turns captured error
 * rows into the three stat tabs the admin error-statistics view renders — by
 * PERIOD, by TYPE (exception class), and by URL — plus the DRILL-DOWN filter
 * that maps a clicked bucket back to its matching rows. Kept free of any
 * Payload/Node runtime so every rule is unit-testable and shared by the stats
 * endpoints, the CSV export, and the admin view (one source → view + CSV +
 * drill-down never diverge).
 */

/** The minimal captured-error shape the stats read (a projection of `errorLogs`). */
export type ErrorRow = {
  exceptionClass?: string | null
  url?: string | null
  statusCode?: number | null
  /** ISO 8601 timestamp (`errorLogs.occurredAt`). */
  occurredAt?: string | null
  actorLabel?: string | null
  message?: string | null
}

/** One counted bucket (an exception class, a URL). */
export type ErrorBucket = { key: string; count: number }

/** One counted period point (a day `YYYY-MM-DD` or a month `YYYY-MM`). */
export type PeriodBucket = { period: string; count: number }

export type StatsGranularity = 'daily' | 'monthly'

/** The drill-down dimension a clicked bucket filters on. */
export type DrillDimension = 'period' | 'type' | 'url'

/** A blank/absent key folds into this explicit bucket so it is never lost from a total. */
const UNKNOWN = '(unknown)'

/** Sorts buckets by count desc, then key asc — stable, deterministic output. */
function sortByCountDesc<T extends { count: number }>(rows: T[], keyOf: (r: T) => string): T[] {
  return [...rows].sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count
    }
    const ak = keyOf(a)
    const bk = keyOf(b)
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })
}

/** Counts rows by an arbitrary string dimension; blank/absent → `(unknown)`. */
function countBy(
  rows: readonly ErrorRow[],
  keyFn: (r: ErrorRow) => string | null | undefined,
): ErrorBucket[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const raw = keyFn(r)
    const key = raw === null || raw === undefined || raw === '' ? UNKNOWN : raw
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return sortByCountDesc(
    [...counts].map(([key, count]) => ({ key, count })),
    (r) => r.key,
  )
}

/** By-TYPE tab (ref 1-58): error counts per exception class, most frequent first. */
export function countByType(rows: readonly ErrorRow[]): ErrorBucket[] {
  return countBy(rows, (r) => r.exceptionClass)
}

/** By-URL tab (ref 1-58): error counts per request URL, most frequent first. */
export function countByUrl(rows: readonly ErrorRow[]): ErrorBucket[] {
  return countBy(rows, (r) => r.url)
}

/** The `YYYY-MM-DD` (daily) or `YYYY-MM` (monthly) period key of an ISO timestamp, or null. */
export function periodKey(
  occurredAt: string | null | undefined,
  granularity: StatsGranularity,
): string | null {
  if (typeof occurredAt !== 'string' || occurredAt.length < 7) {
    return null
  }
  return granularity === 'monthly' ? occurredAt.slice(0, 7) : occurredAt.slice(0, 10)
}

/**
 * By-PERIOD tab (ref 1-58): error counts per calendar day (or month), sorted by
 * period ASCENDING (chronological). Rows with an unparseable timestamp fold into
 * an explicit `(unknown)` bucket, sorted last.
 */
export function countByPeriod(
  rows: readonly ErrorRow[],
  granularity: StatsGranularity = 'daily',
): PeriodBucket[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const key = periodKey(r.occurredAt, granularity) ?? UNKNOWN
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => {
      if (a.period === UNKNOWN) {
        return 1
      }
      if (b.period === UNKNOWN) {
        return -1
      }
      return a.period < b.period ? -1 : a.period > b.period ? 1 : 0
    })
}

/**
 * DRILL-DOWN (ref 1-59): the rows matching a clicked bucket. Clicking a by-type
 * bucket returns every row of that exception class; a by-url bucket every row of
 * that URL; a by-period bucket every row in that day/month. The `(unknown)`
 * bucket matches rows whose dimension is blank/unparseable — the exact inverse
 * of how {@link countByType}/{@link countByUrl}/{@link countByPeriod} bucketed
 * them, so a drill-down count always equals its bucket's count.
 */
export function filterByBucket(
  rows: readonly ErrorRow[],
  dimension: DrillDimension,
  value: string,
  granularity: StatsGranularity = 'daily',
): ErrorRow[] {
  return rows.filter((r) => {
    if (dimension === 'type') {
      const key = r.exceptionClass && r.exceptionClass !== '' ? r.exceptionClass : UNKNOWN
      return key === value
    }
    if (dimension === 'url') {
      const key = r.url && r.url !== '' ? r.url : UNKNOWN
      return key === value
    }
    const key = periodKey(r.occurredAt, granularity) ?? UNKNOWN
    return key === value
  })
}

/** The assembled 3-tab payload the error-statistics view renders + the CSV serializes. */
export type ErrorStatsPayload = {
  from: string
  to: string
  granularity: StatsGranularity
  total: number
  period: PeriodBucket[]
  type: ErrorBucket[]
  url: ErrorBucket[]
}

/** Assembles the 3-tab payload from a set of error rows (pure composition). */
export function buildErrorStatsPayload(
  rows: readonly ErrorRow[],
  args: { from: string; to: string; granularity: StatsGranularity },
): ErrorStatsPayload {
  return {
    from: args.from,
    to: args.to,
    granularity: args.granularity,
    total: rows.length,
    period: countByPeriod(rows, args.granularity),
    type: countByType(rows),
    url: countByUrl(rows),
  }
}
