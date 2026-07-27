import type { LegacySeverity } from './constants'

/**
 * axe-core `impact` → legacy severity taxonomy mapping (Phase 8, Task 8.2;
 * 2-21 callout 4). The legacy U-CMS triaged accessibility errors into three
 * buckets — 심각 (critical) / 위험 (danger) / 경고 (warning). axe-core rates every
 * violation with an `impact` of `critical` | `serious` | `moderate` | `minor`
 * (or, rarely, `null`). Per the brief:
 *
 *   critical            → 심각 (critical)
 *   serious             → 위험 (danger)
 *   moderate | minor    → 경고 (warning)
 *
 * A `null`/unknown impact is treated as the LEAST severe bucket (경고/warning) —
 * it is safer to under-escalate an unclassifiable finding than to over-report it
 * as critical, and axe only returns null for a handful of experimental rules.
 *
 * Pure + dependency-free so the mapping is unit-tested against a fixture with no
 * browser/axe runtime.
 */

/** axe-core's impact levels (+ the null/absent case). */
export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor' | null | undefined

/** Maps one axe `impact` to a legacy severity bucket. */
export function mapImpactToSeverity(impact: AxeImpact): LegacySeverity {
  switch (impact) {
    case 'critical':
      return 'critical'
    case 'serious':
      return 'danger'
    case 'moderate':
    case 'minor':
      return 'warning'
    default:
      // null / undefined / any unexpected value → least severe bucket.
      return 'warning'
  }
}
