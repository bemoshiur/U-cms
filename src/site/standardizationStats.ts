import type { Payload, PayloadRequest, Where } from 'payload'

import { SELF_CHECK_ERROR_TYPES } from '../standardization/constants'
import type { RuleId } from '../standardization/rules'

/**
 * Self-check statistics data layer (Phase 8, Task 8.1b; ref 1-76). Derives the
 * error-type distribution (pie), the monthly trend per error type (line), and a
 * per-year-month table from the stored `standardizationSelfChecks` snapshots
 * (ref 1-75) — filterable by standard source + year-month range. Reuses the
 * Phase-5 insights approach: a single shared loader feeds the on-screen view AND
 * the CSV export, so they never diverge (cf. `errorStatsData.ts`).
 */

const ERROR_IDS = SELF_CHECK_ERROR_TYPES.map((e) => e.id) as RuleId[]

export type SelfCheckSnapshotRow = {
  checkYearMonth: string
  standardSource: string
  counts: Record<RuleId, number>
  checkedAt: string
}

export type SelfCheckStatsQuery = {
  /** Standard source filter (mois / institution); undefined = all. */
  source?: string
  /** Inclusive YYYYMM lower bound. */
  fromYm?: string
  /** Inclusive YYYYMM upper bound. */
  toYm?: string
}

export type SelfCheckStatsResult = {
  /** Error-type distribution over the filtered range. */
  pie: { errorType: RuleId; label: string; total: number; pct: number }[]
  /** Monthly trend: months (x-axis) + one count series per error type. */
  trend: { months: string[]; series: { errorType: RuleId; label: string; counts: number[] }[] }
  /** Per-(year-month, source) table rows. */
  table: SelfCheckSnapshotRow[]
  /** Grand total of all error counts in range. */
  grandTotal: number
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Loads the filtered self-check snapshots (bounded, deterministic order). */
export async function loadSelfCheckSnapshots(
  payload: Payload,
  args: { query?: SelfCheckStatsQuery; req?: PayloadRequest } = {},
): Promise<SelfCheckSnapshotRow[]> {
  const { query = {}, req } = args
  const and: Where[] = []
  if (query.source) and.push({ standardSource: { equals: query.source } })
  if (query.fromYm) and.push({ checkYearMonth: { greater_than_equal: query.fromYm } })
  if (query.toYm) and.push({ checkYearMonth: { less_than_equal: query.toYm } })

  const res = await payload.find({
    collection: 'standardizationSelfChecks',
    ...(and.length > 0 ? { where: { and } } : {}),
    sort: 'checkYearMonth',
    limit: 10000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })

  return res.docs.map((d) => {
    const counts = {} as Record<RuleId, number>
    for (const id of ERROR_IDS) {
      counts[id] = toNum((d as unknown as Record<string, unknown>)[`${id}Count`])
    }
    return {
      checkYearMonth: String(d.checkYearMonth ?? ''),
      standardSource: String(d.standardSource ?? ''),
      counts,
      checkedAt:
        typeof d.checkedAt === 'string' ? d.checkedAt : d.checkedAt ? String(d.checkedAt) : '',
    }
  })
}

/** Aggregates snapshots into the 1-76 statistics payload (pie + trend + table). */
export function buildSelfCheckStats(rows: SelfCheckSnapshotRow[]): SelfCheckStatsResult {
  // Distribution totals per error type.
  const totals = {} as Record<RuleId, number>
  for (const id of ERROR_IDS) totals[id] = 0
  for (const r of rows) {
    for (const id of ERROR_IDS) totals[id] += r.counts[id]
  }
  const grandTotal = ERROR_IDS.reduce((sum, id) => sum + totals[id], 0)
  const labelById = new Map(SELF_CHECK_ERROR_TYPES.map((e) => [e.id, e.label]))

  const pie = ERROR_IDS.map((id) => ({
    errorType: id,
    label: labelById.get(id) ?? id,
    total: totals[id],
    pct: grandTotal > 0 ? Math.round((totals[id] / grandTotal) * 10000) / 100 : 0,
  }))

  // Monthly trend: one point per distinct year-month (summed across sources).
  const months = Array.from(new Set(rows.map((r) => r.checkYearMonth))).sort()
  const byMonth = new Map<string, Record<RuleId, number>>()
  for (const m of months) {
    const zero = {} as Record<RuleId, number>
    for (const id of ERROR_IDS) zero[id] = 0
    byMonth.set(m, zero)
  }
  for (const r of rows) {
    const bucket = byMonth.get(r.checkYearMonth)!
    for (const id of ERROR_IDS) bucket[id] += r.counts[id]
  }
  const series = ERROR_IDS.map((id) => ({
    errorType: id,
    label: labelById.get(id) ?? id,
    counts: months.map((m) => byMonth.get(m)![id]),
  }))

  return { pie, trend: { months, series }, table: rows, grandTotal }
}
