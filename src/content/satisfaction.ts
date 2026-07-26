/**
 * Satisfaction-rating domain helpers (Task 4E; refs 2-18/2-19). Pure of any
 * Payload runtime so the scoring rules are unit-testable and shared by the
 * widget, the public submit, and (Phase 5) the statistics aggregation.
 *
 * ## The 5-point Likert scale (ref 2-19)
 *
 * 매우만족 / 만족 / 보통 / 불만족 / 매우불만족 (very satisfied → very
 * dissatisfied) map to integer scores 5..1. The legacy "만족도 %" is the mean
 * mapped onto 0-100 as `score × 20` (a lone 보통/neutral=3 → 60%, matching the
 * ref-2-19 worked example), i.e. `((mean - 0) / 5) × 100` — kept as one helper
 * so the Phase-5 dashboard and this widget compute it identically.
 */

/** One satisfaction level: its 1-5 score + English/Korean labels (highest first). */
export type SatisfactionLevel = { score: number; label: string; korean: string }

/** The five fixed satisfaction levels (ref 2-19), highest score first. */
export const SATISFACTION_LEVELS: readonly SatisfactionLevel[] = [
  { score: 5, label: 'Very satisfied', korean: '매우만족' },
  { score: 4, label: 'Satisfied', korean: '만족' },
  { score: 3, label: 'Neutral', korean: '보통' },
  { score: 2, label: 'Dissatisfied', korean: '불만족' },
  { score: 1, label: 'Very dissatisfied', korean: '매우불만족' },
] as const

/** The lowest and highest valid scores (inclusive). */
export const MIN_SCORE = 1
export const MAX_SCORE = 5

/** Whether `value` is a valid whole-number satisfaction score (1..5). */
export function isValidScore(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE
  )
}

/** A rating-like row: only its numeric `score` matters for aggregation. */
export type RatingLike = { score?: number | null }

/**
 * The mean score (1-5) of a set of ratings, or `null` when there are none.
 * Ignores rows whose `score` is not a valid 1-5 integer (defensive — a
 * corrupted row never skews the average or throws). Rounded to two decimals.
 */
export function averageScore(ratings: readonly RatingLike[]): number | null {
  let sum = 0
  let count = 0
  for (const r of ratings) {
    if (isValidScore(r?.score)) {
      sum += r.score as number
      count += 1
    }
  }
  if (count === 0) {
    return null
  }
  return Math.round((sum / count) * 100) / 100
}

/** The legacy 만족도 % (0-100) for a mean score, or `null` when there is no mean. */
export function satisfactionPercent(mean: number | null): number | null {
  if (mean === null) {
    return null
  }
  return Math.round(mean * 20 * 100) / 100
}

/** Count of valid ratings in a set (the denominator shown beside the average). */
export function ratingCount(ratings: readonly RatingLike[]): number {
  let count = 0
  for (const r of ratings) {
    if (isValidScore(r?.score)) {
      count += 1
    }
  }
  return count
}

/** A compact summary for the widget + the Phase-5 stats seam. */
export type SatisfactionSummary = {
  count: number
  average: number | null
  percent: number | null
  /** Number of ratings at each score, keyed 1..5. */
  distribution: Record<number, number>
}

/** Summarizes ratings into count + average + percent + a 1-5 distribution. */
export function summarizeSatisfaction(ratings: readonly RatingLike[]): SatisfactionSummary {
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of ratings) {
    if (isValidScore(r?.score)) {
      const score = r.score as number
      distribution[score] = (distribution[score] ?? 0) + 1
    }
  }
  const average = averageScore(ratings)
  return {
    count: ratingCount(ratings),
    average,
    percent: satisfactionPercent(average),
    distribution,
  }
}
