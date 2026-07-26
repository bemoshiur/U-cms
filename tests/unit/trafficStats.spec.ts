import { describe, expect, it } from 'vitest'

import {
  aggregateRange,
  buildDailyRollup,
  countUniqueVisitors,
  type DailyRollup,
  dimensionTotals,
  mergeBreakdowns,
  mergeDailyRollups,
  monthlyFromDaily,
  periodSeries,
  type RawViewLike,
  rollupByDimension,
  rollupByPath,
  topPages,
  withPercentages,
} from '@/content/trafficStats'

/**
 * Task 5A — pure traffic-statistics aggregation (TODO 5.1/5.2). Covers the rollup
 * of raw views into a day, the distinct-session unique count, monthly = sum of
 * daily (incl. uniques), the per-dimension merges the tabs render, and CSV
 * percentages. No Payload runtime — these are the graded pure helpers.
 */

function view(partial: Partial<RawViewLike>): RawViewLike {
  return {
    path: '/',
    menuNumber: null,
    osFamily: 'windows',
    browserFamily: 'chrome',
    deviceType: 'desktop',
    sessionKey: 's1',
    ...partial,
  }
}

describe('rollupByDimension', () => {
  it('counts by key, sorted by views desc then key asc', () => {
    const views = [
      view({ osFamily: 'windows' }),
      view({ osFamily: 'windows' }),
      view({ osFamily: 'ios' }),
      view({ osFamily: 'android' }),
    ]
    expect(rollupByDimension(views, (v) => v.osFamily)).toEqual([
      { key: 'windows', views: 2 },
      { key: 'android', views: 1 },
      { key: 'ios', views: 1 },
    ])
  })

  it('folds a missing dimension into an explicit (unknown) bucket (never lost)', () => {
    const views = [view({ browserFamily: null }), view({ browserFamily: '' })]
    expect(rollupByDimension(views, (v) => v.browserFamily)).toEqual([
      { key: '(unknown)', views: 2 },
    ])
  })
})

describe('countUniqueVisitors (distinct session hashes)', () => {
  it('counts distinct sessionKeys, not rows', () => {
    const views = [
      view({ sessionKey: 'a' }),
      view({ sessionKey: 'a' }),
      view({ sessionKey: 'b' }),
      view({ sessionKey: 'c' }),
    ]
    expect(views).toHaveLength(4)
    expect(countUniqueVisitors(views)).toBe(3)
  })

  it('ignores blank/null session keys', () => {
    expect(countUniqueVisitors([view({ sessionKey: null }), view({ sessionKey: '' })])).toBe(0)
  })
})

describe('rollupByPath (Menu/Page tab)', () => {
  it('counts by canonical path and carries menuNumber for /page/{n}', () => {
    const views = [
      view({ path: '/page/5', menuNumber: 5 }),
      view({ path: '/page/5', menuNumber: 5 }),
      view({ path: '/', menuNumber: null }),
    ]
    expect(rollupByPath(views)).toEqual([
      { path: '/page/5', menuNumber: 5, views: 2 },
      { path: '/', menuNumber: null, views: 1 },
    ])
  })
})

describe('buildDailyRollup', () => {
  it('produces totals, uniques, and every breakdown for a day', () => {
    const views = [
      view({
        path: '/',
        sessionKey: 'a',
        osFamily: 'windows',
        browserFamily: 'chrome',
        deviceType: 'desktop',
      }),
      view({
        path: '/page/3',
        menuNumber: 3,
        sessionKey: 'a',
        osFamily: 'ios',
        browserFamily: 'safari',
        deviceType: 'mobile',
      }),
      view({
        path: '/page/3',
        menuNumber: 3,
        sessionKey: 'b',
        osFamily: 'windows',
        browserFamily: 'chrome',
        deviceType: 'desktop',
      }),
    ]
    const r = buildDailyRollup(views, '2026-07-20')
    expect(r.date).toBe('2026-07-20')
    expect(r.totalViews).toBe(3)
    expect(r.uniqueVisitors).toBe(2) // sessions a, b
    expect(r.byPath).toEqual([
      { path: '/page/3', menuNumber: 3, views: 2 },
      { path: '/', menuNumber: null, views: 1 },
    ])
    expect(r.byOs).toEqual([
      { key: 'windows', views: 2 },
      { key: 'ios', views: 1 },
    ])
    expect(r.byDevice).toEqual([
      { key: 'desktop', views: 2 },
      { key: 'mobile', views: 1 },
    ])
  })
})

const dayA: DailyRollup = {
  date: '2026-07-20',
  totalViews: 3,
  uniqueVisitors: 2,
  byPath: [{ path: '/', menuNumber: null, views: 3 }],
  byOs: [{ key: 'windows', views: 3 }],
  byBrowser: [{ key: 'chrome', views: 3 }],
  byDevice: [{ key: 'desktop', views: 3 }],
}
const dayB: DailyRollup = {
  date: '2026-07-21',
  totalViews: 2,
  uniqueVisitors: 2,
  byPath: [
    { path: '/', menuNumber: null, views: 1 },
    { path: '/page/4', menuNumber: 4, views: 1 },
  ],
  byOs: [{ key: 'ios', views: 2 }],
  byBrowser: [{ key: 'safari', views: 2 }],
  byDevice: [{ key: 'mobile', views: 2 }],
}
const dayC: DailyRollup = {
  date: '2026-08-01',
  totalViews: 5,
  uniqueVisitors: 4,
  byPath: [{ path: '/', menuNumber: null, views: 5 }],
  byOs: [{ key: 'windows', views: 5 }],
  byBrowser: [{ key: 'chrome', views: 5 }],
  byDevice: [{ key: 'desktop', views: 5 }],
}

describe('mergeDailyRollups / monthly = sum of daily', () => {
  it('sums totals, uniques, and every breakdown across days', () => {
    const merged = mergeDailyRollups([dayA, dayB], '2026-07')
    expect(merged.totalViews).toBe(5) // 3 + 2
    expect(merged.uniqueVisitors).toBe(4) // 2 + 2 (Σ daily uniques — daily-rotating session)
    expect(merged.byPath).toEqual([
      { path: '/', menuNumber: null, views: 4 },
      { path: '/page/4', menuNumber: 4, views: 1 },
    ])
    expect(merged.byOs).toEqual([
      { key: 'windows', views: 3 },
      { key: 'ios', views: 2 },
    ])
  })

  it('monthlyFromDaily groups by YYYY-MM, each the sum of its days', () => {
    const months = monthlyFromDaily([dayA, dayB, dayC])
    expect(months.map((m) => m.date)).toEqual(['2026-07', '2026-08'])
    const july = months[0]!
    const august = months[1]!
    // July total = dayA + dayB; August = dayC (identity).
    expect(july.totalViews).toBe(5)
    expect(july.uniqueVisitors).toBe(4)
    expect(august.totalViews).toBe(dayC.totalViews)
    expect(august.uniqueVisitors).toBe(dayC.uniqueVisitors)
    // The whole-range aggregate equals the sum of the monthly aggregates.
    const range = aggregateRange([dayA, dayB, dayC])
    expect(range.totalViews).toBe(july.totalViews + august.totalViews)
    expect(range.uniqueVisitors).toBe(july.uniqueVisitors + august.uniqueVisitors)
  })
})

describe('periodSeries (Period tab)', () => {
  it('daily → one point per day, sorted ascending', () => {
    const series = periodSeries([dayB, dayA], 'daily')
    expect(series).toEqual([
      { period: '2026-07-20', totalViews: 3, uniqueVisitors: 2 },
      { period: '2026-07-21', totalViews: 2, uniqueVisitors: 2 },
    ])
  })

  it('monthly → one point per month (summed)', () => {
    const series = periodSeries([dayA, dayB, dayC], 'monthly')
    expect(series).toEqual([
      { period: '2026-07', totalViews: 5, uniqueVisitors: 4 },
      { period: '2026-08', totalViews: 5, uniqueVisitors: 4 },
    ])
  })
})

describe('topPages / dimensionTotals / mergeBreakdowns', () => {
  it('topPages merges + limits, sorted by views desc', () => {
    expect(topPages([dayA, dayB], 1)).toEqual([{ path: '/', menuNumber: null, views: 4 }])
  })

  it('dimensionTotals picks + merges the requested dimension', () => {
    expect(dimensionTotals([dayA, dayB], 'device')).toEqual([
      { key: 'desktop', views: 3 },
      { key: 'mobile', views: 2 },
    ])
  })

  it('mergeBreakdowns sums by key', () => {
    expect(
      mergeBreakdowns(
        [{ key: 'chrome', views: 2 }],
        [
          { key: 'chrome', views: 3 },
          { key: 'edge', views: 1 },
        ],
      ),
    ).toEqual([
      { key: 'chrome', views: 5 },
      { key: 'edge', views: 1 },
    ])
  })
})

describe('withPercentages (CSV/display)', () => {
  it('adds a rounded percentage-of-total to each row', () => {
    expect(
      withPercentages([
        { key: 'a', views: 3 },
        { key: 'b', views: 1 },
      ]),
    ).toEqual([
      { key: 'a', views: 3, percentage: 75 },
      { key: 'b', views: 1, percentage: 25 },
    ])
  })

  it('is 0% when there are no views (no divide-by-zero)', () => {
    expect(withPercentages([{ key: 'a', views: 0 }])).toEqual([
      { key: 'a', views: 0, percentage: 0 },
    ])
  })
})
