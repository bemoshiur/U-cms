import type { Payload, PayloadRequest, Where } from 'payload'

import type { LegacySeverity } from '../accessibility/constants'
import { SEVERITY_ORDER } from '../accessibility/constants'
import type { ViolationDetail } from '../accessibility/scanResult'

/**
 * Web-accessibility auto-diagnosis data layer (Phase 8, Task 8.2; refs
 * 2-21/2-22/2-23). A single shared loader feeds BOTH the admin views AND the CSV
 * exports (so the on-screen numbers and the exported ones can never diverge —
 * the Phase-5 insights pattern, cf. `errorStatsData.ts` / `standardizationStats.
 * ts`). Pure builders (list summary, monthly trend, itemized report) are
 * unit-testable; the loader is a thin bounded `payload.find`.
 */

/** One stored scan-result row, normalized for the views. */
export type ScanResultRow = {
  id: string | number
  screenName: string
  route: string
  source: string
  inspectedAt: string
  totalItems: number
  successCount: number
  errorCount: number
  criticalCount: number
  dangerCount: number
  warningCount: number
  violations: ViolationDetail[]
}

export type ScanResultsQuery = {
  /** Site (tenant) to scope to — always set by the gated view/endpoint. */
  tenantId: string | number
  /** Free-text filter over screen name / route. */
  keyword?: string
  /** Source filter (scan / popup / db). */
  source?: string
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toIso(v: unknown): string {
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  return v ? String(v) : ''
}

/** Loads the scoped, filtered scan results (newest first, bounded). */
export async function loadScanResults(
  payload: Payload,
  args: { query: ScanResultsQuery; req?: PayloadRequest },
): Promise<ScanResultRow[]> {
  const { query, req } = args
  const and: Where[] = [{ tenant: { equals: query.tenantId } }]
  if (query.source) and.push({ source: { equals: query.source } })
  if (query.keyword && query.keyword.trim()) {
    const kw = query.keyword.trim()
    and.push({ or: [{ screenName: { like: kw } }, { route: { like: kw } }] })
  }

  const res = await payload.find({
    collection: 'accessibilityScanResults',
    where: { and },
    sort: '-inspectedAt',
    limit: 5000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })

  return res.docs.map((d) => {
    const rec = d as unknown as Record<string, unknown>
    const rawViolations = Array.isArray(rec.violations) ? (rec.violations as ViolationDetail[]) : []
    return {
      id: d.id,
      screenName: String(rec.screenName ?? ''),
      route: String(rec.route ?? ''),
      source: String(rec.source ?? ''),
      inspectedAt: toIso(rec.inspectedAt),
      totalItems: toNum(rec.totalItems),
      successCount: toNum(rec.successCount),
      errorCount: toNum(rec.errorCount),
      criticalCount: toNum(rec.criticalCount),
      dangerCount: toNum(rec.dangerCount),
      warningCount: toNum(rec.warningCount),
      violations: rawViolations,
    }
  })
}

/* ── 2-21 results-list summary strip ─────────────────────────────────────────── */

export type ResultsSummary = {
  inspectedScreens: number
  checkedItems: number
  successItems: number
  errorItems: number
  criticalCount: number
  dangerCount: number
  warningCount: number
}

/** Totals the 2-21 info strip across the (already-filtered) rows. */
export function buildResultsSummary(rows: ScanResultRow[]): ResultsSummary {
  const s: ResultsSummary = {
    inspectedScreens: rows.length,
    checkedItems: 0,
    successItems: 0,
    errorItems: 0,
    criticalCount: 0,
    dangerCount: 0,
    warningCount: 0,
  }
  for (const r of rows) {
    s.checkedItems += r.totalItems
    s.successItems += r.successCount
    s.errorItems += r.errorCount
    s.criticalCount += r.criticalCount
    s.dangerCount += r.dangerCount
    s.warningCount += r.warningCount
  }
  return s
}

/* ── 2-23 monthly trend ───────────────────────────────────────────────────────── */

export type MonthlyStatRow = {
  /** YYYYMM. */
  ym: string
  /** 검사화면수 — distinct routes inspected in the month. */
  inspectedScreens: number
  /** 검사건수 — number of inspection runs (rows) in the month. */
  inspections: number
  errorCount: number
  criticalCount: number
  dangerCount: number
  warningCount: number
}

export type MonthlyStats = {
  months: string[]
  rows: MonthlyStatRow[]
}

/** `YYYY-MM-DDT..` ISO → `YYYYMM` (empty when unparseable). */
export function isoToYearMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  return m ? `${m[1]}${m[2]}` : ''
}

/** Buckets rows by year-month into the 2-23 trend table (ascending by ym). */
export function buildMonthlyStats(rows: ScanResultRow[]): MonthlyStats {
  const byMonth = new Map<string, { routes: Set<string>; row: MonthlyStatRow }>()
  for (const r of rows) {
    const ym = isoToYearMonth(r.inspectedAt)
    if (!ym) continue
    let bucket = byMonth.get(ym)
    if (!bucket) {
      bucket = {
        routes: new Set(),
        row: {
          ym,
          inspectedScreens: 0,
          inspections: 0,
          errorCount: 0,
          criticalCount: 0,
          dangerCount: 0,
          warningCount: 0,
        },
      }
      byMonth.set(ym, bucket)
    }
    bucket.routes.add(r.route)
    bucket.row.inspections += 1
    bucket.row.errorCount += r.errorCount
    bucket.row.criticalCount += r.criticalCount
    bucket.row.dangerCount += r.dangerCount
    bucket.row.warningCount += r.warningCount
  }
  const months = Array.from(byMonth.keys()).sort()
  const outRows = months.map((ym) => {
    const bucket = byMonth.get(ym)!
    bucket.row.inspectedScreens = bucket.routes.size
    return bucket.row
  })
  return { months, rows: outRows }
}

/* ── 2-23 itemized inspection report (per axe rule) ──────────────────────────── */

export type ItemizedReportRow = {
  ruleId: string
  description: string
  severity: LegacySeverity
  /** Number of inspected screens where this rule was violated. */
  errorScreens: number
  /** Total occurrences (offending DOM nodes) across screens — the 개선 count. */
  occurrences: number
  /** helpUrl for the rule. */
  helpUrl: string
  /** 준수율 — fraction of inspected screens NOT violating this rule (0–100). */
  complianceRate: number
}

export type ItemizedReport = {
  /** Per-rule rows, worst-compliance first. */
  rows: ItemizedReportRow[]
  /** Per-severity occurrence totals (the "chart" categories). */
  bySeverity: { severity: LegacySeverity; count: number }[]
  /** Screens inspected (denominator for per-rule compliance). */
  inspectedScreens: number
  /** Overall compliance = passing rules / checked rules across all screens (0–100). */
  overallCompliance: number
}

/**
 * Aggregates the (filtered) rows into the itemized report (2-23). Because the
 * pragmatic axe substitute stores only VIOLATIONS per screen (not a per-rule
 * pass tally), each item's 통과/준수율 is expressed at the SCREEN level: the
 * fraction of inspected screens that did NOT violate that rule. `occurrences`
 * is the total offending-node count (the 개선 column). This is an honest
 * axe-derived report, explicitly NOT the legacy fixed 33-KWCAG-item table.
 */
export function buildItemizedReport(rows: ScanResultRow[]): ItemizedReport {
  const inspectedScreens = rows.length
  type Agg = {
    ruleId: string
    description: string
    severity: LegacySeverity
    helpUrl: string
    errorScreens: number
    occurrences: number
  }
  const byRule = new Map<string, Agg>()
  const severityTotals: Record<LegacySeverity, number> = { critical: 0, danger: 0, warning: 0 }

  for (const r of rows) {
    for (const v of r.violations) {
      let agg = byRule.get(v.ruleId)
      if (!agg) {
        agg = {
          ruleId: v.ruleId,
          description: v.description,
          severity: v.severity,
          helpUrl: v.helpUrl,
          errorScreens: 0,
          occurrences: 0,
        }
        byRule.set(v.ruleId, agg)
      }
      agg.errorScreens += 1
      agg.occurrences += v.occurrenceCount
      severityTotals[v.severity] += v.occurrenceCount
    }
  }

  const reportRows: ItemizedReportRow[] = Array.from(byRule.values())
    .map((a) => ({
      ruleId: a.ruleId,
      description: a.description,
      severity: a.severity,
      errorScreens: a.errorScreens,
      occurrences: a.occurrences,
      helpUrl: a.helpUrl,
      complianceRate:
        inspectedScreens > 0
          ? Math.round(((inspectedScreens - a.errorScreens) / inspectedScreens) * 1000) / 10
          : 100,
    }))
    // Worst first: most error screens, then most occurrences.
    .sort((x, y) => y.errorScreens - x.errorScreens || y.occurrences - x.occurrences)

  let checkedTotal = 0
  let successTotal = 0
  for (const r of rows) {
    checkedTotal += r.totalItems
    successTotal += r.successCount
  }

  return {
    rows: reportRows,
    bySeverity: SEVERITY_ORDER.map((severity) => ({ severity, count: severityTotals[severity] })),
    inspectedScreens,
    overallCompliance:
      checkedTotal > 0 ? Math.round((successTotal / checkedTotal) * 1000) / 10 : 100,
  }
}
