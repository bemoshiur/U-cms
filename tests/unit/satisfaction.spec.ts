import { describe, expect, it } from 'vitest'

import {
  averageScore,
  isValidScore,
  ratingCount,
  satisfactionPercent,
  SATISFACTION_LEVELS,
  summarizeSatisfaction,
} from '@/content/satisfaction'

describe('satisfaction scoring helpers (Task 4E)', () => {
  describe('isValidScore', () => {
    it('accepts integers 1..5 only', () => {
      expect([1, 2, 3, 4, 5].every(isValidScore)).toBe(true)
      for (const bad of [0, 6, -1, 2.5, NaN, '3', null, undefined]) {
        expect(isValidScore(bad as unknown)).toBe(false)
      }
    })
  })

  describe('averageScore', () => {
    it('returns null for no ratings', () => {
      expect(averageScore([])).toBeNull()
    })

    it('computes the mean, rounded to 2 decimals', () => {
      expect(averageScore([{ score: 5 }, { score: 4 }, { score: 3 }])).toBe(4)
      expect(averageScore([{ score: 5 }, { score: 4 }])).toBe(4.5)
      expect(averageScore([{ score: 5 }, { score: 4 }, { score: 4 }])).toBe(4.33)
    })

    it('ignores rows with an invalid score (never skews or throws)', () => {
      expect(averageScore([{ score: 4 }, { score: 2.5 }, { score: 0 }, { score: null }])).toBe(4)
      expect(averageScore([{ score: 2.5 }, { score: null }])).toBeNull()
    })
  })

  describe('satisfactionPercent (legacy 만족도 %)', () => {
    it('maps a mean onto score × 20 (ref-2-19: a lone 보통/3 → 60%)', () => {
      expect(satisfactionPercent(3)).toBe(60)
      expect(satisfactionPercent(5)).toBe(100)
      expect(satisfactionPercent(1)).toBe(20)
      expect(satisfactionPercent(4.5)).toBe(90)
    })

    it('is null when there is no mean', () => {
      expect(satisfactionPercent(null)).toBeNull()
    })
  })

  describe('ratingCount + summarizeSatisfaction', () => {
    it('counts only valid ratings', () => {
      expect(ratingCount([{ score: 5 }, { score: 2.5 }, { score: 3 }])).toBe(2)
    })

    it('summarizes count + average + percent + distribution', () => {
      const s = summarizeSatisfaction([{ score: 5 }, { score: 3 }, { score: 3 }, { score: 2.5 }])
      expect(s.count).toBe(3)
      expect(s.average).toBeCloseTo(3.67, 2)
      expect(s.percent).toBeCloseTo(73.4, 1)
      expect(s.distribution).toEqual({ 1: 0, 2: 0, 3: 2, 4: 0, 5: 1 })
    })

    it('is empty-safe', () => {
      const s = summarizeSatisfaction([])
      expect(s).toEqual({
        count: 0,
        average: null,
        percent: null,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      })
    })
  })

  describe('SATISFACTION_LEVELS', () => {
    it('has the 5 Likert levels, scores 5..1 highest-first', () => {
      expect(SATISFACTION_LEVELS.map((l) => l.score)).toEqual([5, 4, 3, 2, 1])
      expect(SATISFACTION_LEVELS.map((l) => l.korean)).toEqual([
        '매우만족',
        '만족',
        '보통',
        '불만족',
        '매우불만족',
      ])
    })
  })
})
