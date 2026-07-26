/**
 * Pure traffic-statistics domain (Task 5A; TODO 5.1/5.2, refs 1-54 / 2-17).
 * Turns raw page-view rows into the day's rollup, and daily rollups into the
 * period/menu/OS/browser/device views the admin statistics tabs render. Kept
 * free of any Payload/Node runtime so every rule is unit-testable and shared by
 * the aggregation job, the stats endpoints, and the admin view.
 *
 * ## Privacy (Phase-6-ready — aggregates hold NO PII)
 *
 * The rollups store ONLY coarse counts by coarse dimension (a canonical/bucketed
 * path, an OS/browser FAMILY, a device class) plus two integers (total views,
 * unique visitors). No raw IP, UA, query, session key, or member link ever
 * reaches a rollup — the unique-visitor figure is a distinct-COUNT of the raw
 * daily session hashes computed at aggregation time and then discarded, never
 * stored. This is exactly the PII-free aggregate the Phase-6 privacy subsystem
 * requires, and it lets raw `pageViews` be pruned (retention) while the
 * long-lived aggregates remain.
 *
 * ## Why monthly = sum of daily (incl. unique visitors)
 *
 * Totals and every dimension breakdown are additive, so a month is the sum of
 * its days. Unique visitors is ALSO summed across days — not because that
 * deduplicates a visitor seen on two days, but because it CAN'T: the raw
 * `sessionKey` rotates every calendar day BY DESIGN (T4E privacy posture — a
 * visitor is deliberately not trackable across days), so cross-day dedup is
 * impossible and the only coherent monthly figure is Σ(daily uniques). This is
 * documented as an upper bound on true monthly uniques and is the intended,
 * privacy-preserving definition.
 */

/** One counted dimension value (an OS/browser family, a device class, a path). */
export type Breakdown = { key: string; views: number }

/** A counted path, carrying the resolved menu number for `/page/{n}` rows. */
export type PathBreakdown = { path: string; menuNumber: number | null; views: number }

/** The compact per-(site, day) rollup stored in `trafficDaily` (see the collection). */
export type DailyRollup = {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string
  totalViews: number
  uniqueVisitors: number
  byPath: PathBreakdown[]
  byOs: Breakdown[]
  byBrowser: Breakdown[]
  byDevice: Breakdown[]
}

/** The minimal raw page-view shape the aggregation reads (privacy-safe fields only). */
export type RawViewLike = {
  path?: string | null
  menuNumber?: number | null
  osFamily?: string | null
  browserFamily?: string | null
  deviceType?: string | null
  /** The daily-rotating salted hash — used ONLY to distinct-count, never stored in a rollup. */
  sessionKey?: string | null
}

/** Sorts breakdown rows by views desc, then key asc — stable, deterministic output. */
function sortBreakdown<T extends { views: number; key?: string; path?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.views !== a.views) {
      return b.views - a.views
    }
    const ak = (a.key ?? a.path ?? '') as string
    const bk = (b.key ?? b.path ?? '') as string
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })
}

/**
 * Counts views by an arbitrary dimension key, returning rows sorted by views
 * desc. `keyFn` returns the coarse family/class/path; a null/blank key folds
 * into an explicit `'(unknown)'` bucket so a missing dimension never vanishes
 * from a total.
 */
export function rollupByDimension(
  views: RawViewLike[],
  keyFn: (v: RawViewLike) => string | null | undefined,
): Breakdown[] {
  const counts = new Map<string, number>()
  for (const v of views) {
    const raw = keyFn(v)
    const key = raw === null || raw === undefined || raw === '' ? '(unknown)' : raw
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return sortBreakdown([...counts].map(([key, count]) => ({ key, views: count })))
}

/** Distinct count of a per-view key (null/blank keys are ignored, not counted). */
export function countDistinct(
  views: RawViewLike[],
  keyFn: (v: RawViewLike) => string | null | undefined,
): number {
  const seen = new Set<string>()
  for (const v of views) {
    const key = keyFn(v)
    if (key !== null && key !== undefined && key !== '') {
      seen.add(key)
    }
  }
  return seen.size
}

/** Unique visitors for a day = distinct raw session hashes (never stored). */
export function countUniqueVisitors(views: RawViewLike[]): number {
  return countDistinct(views, (v) => v.sessionKey)
}

/** Rolls up views by canonical path, carrying `menuNumber` for `/page/{n}` rows. */
export function rollupByPath(views: RawViewLike[]): PathBreakdown[] {
  const counts = new Map<string, { menuNumber: number | null; views: number }>()
  for (const v of views) {
    const path = v.path && v.path !== '' ? v.path : '(unknown)'
    const existing = counts.get(path)
    if (existing) {
      existing.views += 1
    } else {
      counts.set(path, {
        menuNumber: typeof v.menuNumber === 'number' ? v.menuNumber : null,
        views: 1,
      })
    }
  }
  return sortBreakdown(
    [...counts].map(([path, { menuNumber, views: n }]) => ({ path, menuNumber, views: n })),
  )
}

/** Builds the full compact rollup for one (site, day) from that day's raw rows. */
export function buildDailyRollup(views: RawViewLike[], date: string): DailyRollup {
  return {
    date,
    totalViews: views.length,
    uniqueVisitors: countUniqueVisitors(views),
    byPath: rollupByPath(views),
    byOs: rollupByDimension(views, (v) => v.osFamily),
    byBrowser: rollupByDimension(views, (v) => v.browserFamily),
    byDevice: rollupByDimension(views, (v) => v.deviceType),
  }
}

/** Sums many breakdown arrays into one (key → total views), sorted desc. */
export function mergeBreakdowns(...arrays: Breakdown[][]): Breakdown[] {
  const counts = new Map<string, number>()
  for (const arr of arrays) {
    for (const { key, views } of arr) {
      counts.set(key, (counts.get(key) ?? 0) + views)
    }
  }
  return sortBreakdown([...counts].map(([key, views]) => ({ key, views })))
}

/** Sums many path-breakdown arrays into one (path → total views), sorted desc. */
export function mergePathBreakdowns(...arrays: PathBreakdown[][]): PathBreakdown[] {
  const counts = new Map<string, { menuNumber: number | null; views: number }>()
  for (const arr of arrays) {
    for (const row of arr) {
      const existing = counts.get(row.path)
      if (existing) {
        existing.views += row.views
        if (existing.menuNumber === null && row.menuNumber !== null) {
          existing.menuNumber = row.menuNumber
        }
      } else {
        counts.set(row.path, { menuNumber: row.menuNumber, views: row.views })
      }
    }
  }
  return sortBreakdown(
    [...counts].map(([path, { menuNumber, views }]) => ({ path, menuNumber, views })),
  )
}

/**
 * Merges a set of daily rollups into one aggregate rollup (a month, a custom
 * range, whatever the caller grouped). Totals + every breakdown sum; unique
 * visitors is Σ(daily uniques) — see the module doc for why that is the only
 * coherent (and privacy-preserving) definition. `label` is the aggregate's key
 * (e.g. `2026-07` for a month); `date` mirrors it for a uniform shape.
 */
export function mergeDailyRollups(dailies: DailyRollup[], label: string): DailyRollup {
  return {
    date: label,
    totalViews: dailies.reduce((sum, d) => sum + d.totalViews, 0),
    uniqueVisitors: dailies.reduce((sum, d) => sum + d.uniqueVisitors, 0),
    byPath: mergePathBreakdowns(...dailies.map((d) => d.byPath)),
    byOs: mergeBreakdowns(...dailies.map((d) => d.byOs)),
    byBrowser: mergeBreakdowns(...dailies.map((d) => d.byBrowser)),
    byDevice: mergeBreakdowns(...dailies.map((d) => d.byDevice)),
  }
}

/** The `YYYY-MM` month key of a `YYYY-MM-DD` date string. */
export function monthKey(date: string): string {
  return date.slice(0, 7)
}

/**
 * Groups daily rollups into monthly rollups (one per `YYYY-MM`), each the sum of
 * its days — the daily/monthly toggle's monthly side. Returned sorted by month
 * ascending. `monthlyFromDaily` name matches the brief's helper list.
 */
export function monthlyFromDaily(dailies: DailyRollup[]): DailyRollup[] {
  const byMonth = new Map<string, DailyRollup[]>()
  for (const d of dailies) {
    const m = monthKey(d.date)
    const arr = byMonth.get(m)
    if (arr) {
      arr.push(d)
    } else {
      byMonth.set(m, [d])
    }
  }
  return [...byMonth.keys()].sort().map((m) => mergeDailyRollups(byMonth.get(m)!, m))
}

/** One point on the period tab's PV + unique-visitor time series. */
export type PeriodPoint = { period: string; totalViews: number; uniqueVisitors: number }

/**
 * The Period tab (tab 1): a PV + unique-visitor series over the range, daily or
 * monthly. Sorted by period ascending. For `monthly` the daily rollups are
 * folded to months first (Σ per month, incl. uniques per the module doc).
 */
export function periodSeries(
  dailies: DailyRollup[],
  granularity: 'daily' | 'monthly' = 'daily',
): PeriodPoint[] {
  const source =
    granularity === 'monthly'
      ? monthlyFromDaily(dailies)
      : [...dailies].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return source.map((d) => ({
    period: d.date,
    totalViews: d.totalViews,
    uniqueVisitors: d.uniqueVisitors,
  }))
}

/** Top-N path rows across a set of daily rollups (the Menu/Page tab, tab 2). */
export function topPages(dailies: DailyRollup[], limit = 20): PathBreakdown[] {
  return mergePathBreakdowns(...dailies.map((d) => d.byPath)).slice(0, limit)
}

/** Merged breakdown for one dimension across a set of daily rollups (tabs 3-5). */
export function dimensionTotals(
  dailies: DailyRollup[],
  dimension: 'os' | 'browser' | 'device',
): Breakdown[] {
  const pick = (d: DailyRollup): Breakdown[] =>
    dimension === 'os' ? d.byOs : dimension === 'browser' ? d.byBrowser : d.byDevice
  return mergeBreakdowns(...dailies.map(pick))
}

/** A whole-of-range aggregate (all dailies summed) — the tab totals + PV/UV headline. */
export function aggregateRange(dailies: DailyRollup[]): DailyRollup {
  return mergeDailyRollups(dailies, 'range')
}

/** Adds a percentage-of-total to each breakdown row (rounded to 1 dp) for display/CSV. */
export function withPercentages(rows: Breakdown[]): (Breakdown & { percentage: number })[] {
  const total = rows.reduce((sum, r) => sum + r.views, 0)
  return rows.map((r) => ({
    ...r,
    percentage: total > 0 ? Math.round((r.views / total) * 1000) / 10 : 0,
  }))
}
