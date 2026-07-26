import { describe, expect, it } from 'vitest'

import {
  byMenu,
  type RatingRow,
  ratingTotal,
  scoreDistribution,
  weightedAverage,
} from '@/content/satisfactionStats'

/** Task 5B (TODO 5.4, ref 2-19) — pure satisfaction-statistics helpers. */

describe('satisfactionStats pure helpers', () => {
  it('scoreDistribution returns all 5 buckets (5→1) with count + weighted %', () => {
    const ratings: RatingRow[] = [
      { score: 5 },
      { score: 5 },
      { score: 3 },
      { score: 1 },
      { score: 7 }, // invalid — ignored
    ]
    const dist = scoreDistribution(ratings)
    expect(dist.map((b) => b.score)).toEqual([5, 4, 3, 2, 1])
    expect(dist.find((b) => b.score === 5)).toMatchObject({ count: 2, percentage: 50 })
    expect(dist.find((b) => b.score === 4)).toMatchObject({ count: 0, percentage: 0 })
    expect(dist.find((b) => b.score === 3)).toMatchObject({ count: 1, percentage: 25 })
    expect(dist.find((b) => b.score === 1)).toMatchObject({ count: 1, percentage: 25 })
  })

  it('empty set → all-zero buckets, never NaN', () => {
    const dist = scoreDistribution([])
    expect(dist).toHaveLength(5)
    expect(dist.every((b) => b.count === 0 && b.percentage === 0)).toBe(true)
    expect(weightedAverage([])).toBeNull()
    expect(ratingTotal([])).toBe(0)
  })

  it('weightedAverage = Σ(score×count)/Σcount', () => {
    // (5+5+3+1)/4 = 3.5
    expect(weightedAverage([{ score: 5 }, { score: 5 }, { score: 3 }, { score: 1 }])).toBe(3.5)
    // A lone neutral (3) → 3
    expect(weightedAverage([{ score: 3 }])).toBe(3)
  })

  it('byMenu groups by menu, sorted by count desc then average desc; nulls fold together', () => {
    const ratings: RatingRow[] = [
      { score: 5, menuId: 10 },
      { score: 3, menuId: 10 },
      { score: 4, menuId: 20 },
      { score: 5, menuId: null },
    ]
    const rows = byMenu(ratings)
    // menu 10 has 2 ratings (avg 4), menu 20 has 1 (avg 4), null has 1 (avg 5).
    expect(rows[0]).toMatchObject({ menuId: 10, count: 2, average: 4 })
    // Ties on count=1: higher average first → null(5) before 20(4).
    expect(rows[1]).toMatchObject({ menuId: null, count: 1, average: 5 })
    expect(rows[2]).toMatchObject({ menuId: 20, count: 1, average: 4 })
    // satisfaction % = average × 20
    expect(rows[0]!.percent).toBe(80)
  })
})
