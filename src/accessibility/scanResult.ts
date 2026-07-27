import type { LegacySeverity } from './constants'
import { type AxeImpact, mapImpactToSeverity } from './severity'

/**
 * Pure axe-results → stored-scan-result summarization (Phase 8, Task 8.2). Turns
 * one axe-core run over a rendered screen into the per-screen row shape the
 * `accessibilityScanResults` collection stores and the 2-21/2-22/2-23 views read.
 *
 * DELIBERATELY DEFENSIVE: it accepts a loosely-typed, possibly-partial object so
 * it can normalize BOTH (a) a real axe run from the ops/CI scan runner AND (b)
 * UNTRUSTED client input POSTed by the public validation-mode toggle. Every
 * count is DERIVED here (never trusted from the caller), arrays + strings are
 * CLAMPED/TRUNCATED, so a forged body can never inflate counts or store an
 * unbounded blob. The CSV export layer separately neutralizes formula-injection.
 *
 * Pure + dependency-free (no axe/browser import) → unit-tested against a fixture.
 */

/** Hard caps that bound what a single scan result can store (client-safety). */
export const MAX_STORED_VIOLATIONS = 200
export const MAX_NODES_PER_VIOLATION = 20
const MAX_TEXT_LEN = 2000
const MAX_HTML_LEN = 1000

/** One violated rule, denormalized for the 2-22 detail pane. */
export type ViolationDetail = {
  /** axe rule id, e.g. `image-alt`, `label`, `color-contrast`. */
  ruleId: string
  /** Short rule description (axe `help`/`description`). */
  description: string
  /** Legacy severity bucket derived from axe `impact`. */
  severity: LegacySeverity
  /** The raw axe impact (kept for the itemized report / traceability). */
  impact: string
  /** How many DOM nodes matched this rule on the screen (occurrence count). */
  occurrenceCount: number
  /** Deep-link to axe's remediation docs (helpUrl). */
  helpUrl: string
  /** A representative offending HTML snippet (from the first node), truncated. */
  sampleHtml: string
  /** axe's per-node failure reason + remediation guidance (from the first node). */
  failureSummary: string
  /** WCAG / KWCAG tags for the itemized report grouping (e.g. `wcag2a`, `cat.forms`). */
  tags: string[]
}

/** The per-screen summary the collection stores (2-21 columns + detail). */
export type ScanSummary = {
  totalItems: number
  successCount: number
  errorCount: number
  criticalCount: number
  dangerCount: number
  warningCount: number
  violations: ViolationDetail[]
}

/** Loose shape of an axe node (only the fields we read). */
type LooseNode = { html?: unknown; failureSummary?: unknown }
/** Loose shape of an axe result rule (only the fields we read). */
type LooseRule = {
  id?: unknown
  impact?: unknown
  description?: unknown
  help?: unknown
  helpUrl?: unknown
  tags?: unknown
  nodes?: unknown
}
/** Loose shape of a full axe run (only the buckets we read). */
export type LooseAxeResults = {
  violations?: unknown
  passes?: unknown
  incomplete?: unknown
  inapplicable?: unknown
}

function str(v: unknown, max = MAX_TEXT_LEN): string {
  if (typeof v !== 'string') return ''
  return v.length > max ? v.slice(0, max) : v
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function tagList(v: unknown): string[] {
  return arr(v)
    .filter((t): t is string => typeof t === 'string')
    .slice(0, 30)
    .map((t) => str(t, 60))
}

/** Normalizes one axe rule into a bounded {@link ViolationDetail}. */
function toViolationDetail(rule: LooseRule): ViolationDetail {
  const nodes = arr(rule.nodes) as LooseNode[]
  const first = nodes[0]
  const impact = str(rule.impact, 20)
  return {
    ruleId: str(rule.id, 100) || 'unknown',
    description: str(rule.help) || str(rule.description),
    severity: mapImpactToSeverity((rule.impact ?? null) as AxeImpact),
    impact: impact || 'none',
    occurrenceCount: Math.min(nodes.length, MAX_NODES_PER_VIOLATION),
    helpUrl: str(rule.helpUrl, 500),
    sampleHtml: str(first?.html, MAX_HTML_LEN),
    failureSummary: str(first?.failureSummary),
    tags: tagList(rule.tags),
  }
}

/**
 * Summarizes an axe run into the stored per-screen result. `totalItems` counts
 * the rules that were actually EVALUATED (passes + violations + incomplete);
 * `successCount` is passing rules; `errorCount` is violated rules; the three
 * severity counts partition `errorCount` (each violation lands in exactly one
 * bucket — critical + danger + warning === errorCount), matching the legacy
 * 2-21 strip where 심각+위험+경고 sums to 에러 항목수.
 */
export function summarizeAxeResults(axe: LooseAxeResults): ScanSummary {
  const rawViolations = arr(axe.violations) as LooseRule[]
  const passes = arr(axe.passes)
  const incomplete = arr(axe.incomplete)

  const violations = rawViolations.slice(0, MAX_STORED_VIOLATIONS).map(toViolationDetail)

  let criticalCount = 0
  let dangerCount = 0
  let warningCount = 0
  for (const v of violations) {
    if (v.severity === 'critical') criticalCount += 1
    else if (v.severity === 'danger') dangerCount += 1
    else warningCount += 1
  }

  const successCount = passes.length
  const errorCount = violations.length
  const totalItems = successCount + rawViolations.length + incomplete.length

  return {
    totalItems,
    successCount,
    errorCount,
    criticalCount,
    dangerCount,
    warningCount,
    violations,
  }
}
