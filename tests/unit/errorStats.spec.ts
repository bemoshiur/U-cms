import { describe, expect, it } from 'vitest'

import {
  buildErrorStatsPayload,
  countByPeriod,
  countByType,
  countByUrl,
  type ErrorRow,
  filterByBucket,
  periodKey,
} from '@/content/errorStats'

/**
 * Task 5C — pure error-statistics aggregation (refs 1-58/1-59). Covers the three
 * stat tabs (period/type/URL) and, crucially, the DRILL-DOWN round-trip: a
 * drill-down on a bucket returns exactly that bucket's count.
 */

function row(partial: Partial<ErrorRow>): ErrorRow {
  return {
    exceptionClass: 'TypeError',
    url: '/api/posts',
    statusCode: 500,
    occurredAt: '2026-07-20T10:00:00.000Z',
    actorLabel: null,
    message: 'boom',
    ...partial,
  }
}

describe('countByType', () => {
  it('counts by exception class, sorted by count desc then key asc', () => {
    const rows = [
      row({ exceptionClass: 'TypeError' }),
      row({ exceptionClass: 'TypeError' }),
      row({ exceptionClass: 'RangeError' }),
      row({ exceptionClass: 'APIError' }),
    ]
    expect(countByType(rows)).toEqual([
      { key: 'TypeError', count: 2 },
      { key: 'APIError', count: 1 },
      { key: 'RangeError', count: 1 },
    ])
  })

  it('folds a missing class into (unknown)', () => {
    expect(countByType([row({ exceptionClass: null }), row({ exceptionClass: '' })])).toEqual([
      { key: '(unknown)', count: 2 },
    ])
  })
})

describe('countByUrl', () => {
  it('counts by URL, most frequent first', () => {
    const rows = [
      row({ url: '/api/a' }),
      row({ url: '/api/a' }),
      row({ url: '/api/a' }),
      row({ url: '/api/b' }),
    ]
    expect(countByUrl(rows)).toEqual([
      { key: '/api/a', count: 3 },
      { key: '/api/b', count: 1 },
    ])
  })
})

describe('periodKey / countByPeriod', () => {
  it('keys by day or month', () => {
    expect(periodKey('2026-07-20T10:00:00.000Z', 'daily')).toBe('2026-07-20')
    expect(periodKey('2026-07-20T10:00:00.000Z', 'monthly')).toBe('2026-07')
    expect(periodKey(null, 'daily')).toBeNull()
  })

  it('groups by day, sorted chronologically ascending', () => {
    const rows = [
      row({ occurredAt: '2026-07-21T01:00:00.000Z' }),
      row({ occurredAt: '2026-07-20T23:00:00.000Z' }),
      row({ occurredAt: '2026-07-20T09:00:00.000Z' }),
    ]
    expect(countByPeriod(rows, 'daily')).toEqual([
      { period: '2026-07-20', count: 2 },
      { period: '2026-07-21', count: 1 },
    ])
  })

  it('groups by month, and folds bad timestamps into (unknown) last', () => {
    const rows = [
      row({ occurredAt: '2026-06-01T00:00:00.000Z' }),
      row({ occurredAt: '2026-07-15T00:00:00.000Z' }),
      row({ occurredAt: null }),
    ]
    expect(countByPeriod(rows, 'monthly')).toEqual([
      { period: '2026-06', count: 1 },
      { period: '2026-07', count: 1 },
      { period: '(unknown)', count: 1 },
    ])
  })
})

describe('filterByBucket (drill-down)', () => {
  const rows = [
    row({ exceptionClass: 'TypeError', url: '/api/a', occurredAt: '2026-07-20T10:00:00.000Z' }),
    row({ exceptionClass: 'TypeError', url: '/api/b', occurredAt: '2026-07-20T12:00:00.000Z' }),
    row({ exceptionClass: 'RangeError', url: '/api/a', occurredAt: '2026-07-21T10:00:00.000Z' }),
  ]

  it('drills into a type bucket', () => {
    expect(filterByBucket(rows, 'type', 'TypeError')).toHaveLength(2)
    expect(filterByBucket(rows, 'type', 'RangeError')).toHaveLength(1)
  })

  it('drills into a url bucket', () => {
    expect(filterByBucket(rows, 'url', '/api/a')).toHaveLength(2)
  })

  it('drills into a period bucket (day + month)', () => {
    expect(filterByBucket(rows, 'period', '2026-07-20', 'daily')).toHaveLength(2)
    expect(filterByBucket(rows, 'period', '2026-07', 'monthly')).toHaveLength(3)
  })

  it('drill-down count always equals the bucket count (round-trip invariant)', () => {
    for (const b of countByType(rows)) {
      expect(filterByBucket(rows, 'type', b.key)).toHaveLength(b.count)
    }
    for (const b of countByUrl(rows)) {
      expect(filterByBucket(rows, 'url', b.key)).toHaveLength(b.count)
    }
    for (const b of countByPeriod(rows, 'daily')) {
      expect(filterByBucket(rows, 'period', b.period, 'daily')).toHaveLength(b.count)
    }
  })
})

describe('buildErrorStatsPayload', () => {
  it('assembles total + the three tabs', () => {
    const rows = [
      row({ exceptionClass: 'TypeError', url: '/api/a' }),
      row({ exceptionClass: 'RangeError', url: '/api/a' }),
    ]
    const payload = buildErrorStatsPayload(rows, {
      from: '2026-07-01',
      to: '2026-07-31',
      granularity: 'daily',
    })
    expect(payload.total).toBe(2)
    expect(payload.type).toHaveLength(2)
    expect(payload.url).toEqual([{ key: '/api/a', count: 2 }])
    expect(payload.period[0]!.count).toBe(2)
  })
})
