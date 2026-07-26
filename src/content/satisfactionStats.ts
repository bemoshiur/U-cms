/**
 * Pure satisfaction-statistics domain (Task 5B; TODO 5.4, ref 2-19). Turns raw
 * satisfaction ratings (a 1-5 score + the rated menu) into the distribution
 * table (count + % per score), the weighted average, and the per-menu averages
 * the admin satisfaction-statistics view renders and the CSV export serializes.
 * Kept free of any Payload/Node runtime so every rule is unit-testable and
 * shared by the stats endpoints and the admin view.
 *
 * Builds on the shared `src/content/satisfaction.ts` scale (1-5 = 매우불만족 →
 * 매우만족; 만족도 % = mean × 20), reusing its validity + percent helpers so the
 * dashboard and the public widget compute satisfaction identically.
 */

import {
  averageScore,
  isValidScore,
  MAX_SCORE,
  MIN_SCORE,
  satisfactionPercent,
} from './satisfaction'

/** A rating row the stats read: a numeric score + the rated menu id (nullable). */
export type RatingRow = { score?: number | null; menuId?: string | number | null }

/** One score bucket in the distribution: the score, its count, and its % of the total. */
export type ScoreBucket = { score: number; count: number; percentage: number }

/**
 * Count + percentage per score, for EVERY score 1..5 (highest first, so the
 * table reads 매우만족 → 매우불만족). The percentage weights each score by its
 * share of the valid ratings (rounded to 1 dp); an empty set yields all-zero
 * buckets (never NaN). Invalid/corrupt scores are ignored (never counted).
 */
export function scoreDistribution(ratings: readonly RatingRow[]): ScoreBucket[] {
  const counts = new Map<number, number>()
  let total = 0
  for (const r of ratings) {
    if (isValidScore(r?.score)) {
      const s = r.score as number
      counts.set(s, (counts.get(s) ?? 0) + 1)
      total += 1
    }
  }
  const buckets: ScoreBucket[] = []
  for (let score = MAX_SCORE; score >= MIN_SCORE; score--) {
    const count = counts.get(score) ?? 0
    buckets.push({
      score,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    })
  }
  return buckets
}

/** Count of valid ratings (the distribution/average denominator). */
export function ratingTotal(ratings: readonly RatingRow[]): number {
  let n = 0
  for (const r of ratings) {
    if (isValidScore(r?.score)) {
      n += 1
    }
  }
  return n
}

/**
 * The weighted average score — Σ(score × count) / Σ(count) over the 1-5
 * distribution — or `null` when there are no valid ratings. Mathematically the
 * mean, but computed explicitly from the score weighting (ref 2-19's weighted
 * table). Rounded to two decimals, matching `averageScore`.
 */
export function weightedAverage(ratings: readonly RatingRow[]): number | null {
  const dist = scoreDistribution(ratings)
  let weighted = 0
  let total = 0
  for (const b of dist) {
    weighted += b.score * b.count
    total += b.count
  }
  if (total === 0) {
    return null
  }
  return Math.round((weighted / total) * 100) / 100
}

/** A per-menu aggregate: the menu id (null = ratings with no menu), count, average, %. */
export type MenuAggregate = {
  menuId: string | number | null
  count: number
  average: number | null
  percent: number | null
}

/**
 * Per-menu satisfaction (the "average score per page/menu" bars, ref 2-19).
 * Groups ratings by their `menuId` (null folds into one "no menu" bucket for
 * page ratings without an owning menu), returning count + average + 만족도 %
 * per menu, sorted by count DESC then average DESC (deterministic).
 */
export function byMenu(ratings: readonly RatingRow[]): MenuAggregate[] {
  const groups = new Map<string, { menuId: string | number | null; rows: RatingRow[] }>()
  for (const r of ratings) {
    if (!isValidScore(r?.score)) {
      continue
    }
    const menuId = r.menuId ?? null
    const key = menuId === null ? '__null__' : String(menuId)
    const g = groups.get(key)
    if (g) {
      g.rows.push(r)
    } else {
      groups.set(key, { menuId, rows: [r] })
    }
  }
  const out: MenuAggregate[] = []
  for (const { menuId, rows } of groups.values()) {
    const average = averageScore(rows)
    out.push({ menuId, count: rows.length, average, percent: satisfactionPercent(average) })
  }
  return out.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count
    }
    return (b.average ?? 0) - (a.average ?? 0)
  })
}
