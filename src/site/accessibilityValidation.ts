import { createHmac } from 'crypto'
import type { Payload } from 'payload'

import type { ScanSource, ValidationMode } from '../accessibility/constants'
import { type LooseAxeResults, summarizeAxeResults } from '../accessibility/scanResult'
import { validationModeActions } from '../accessibility/validationMode'
import { TrafficDedup } from './trafficDedup'

/**
 * Server-side persist path for the public accessibility validation toggle (Phase
 * 8, Task 8.2 / TODO 8.3; ref 1-74 ACS_VLD_USE_CD). The public-site component
 * runs axe-core in the visitor's browser (dev/local only) and, in `db`/`popup_db`
 * mode, POSTs the raw results to `/accessibility-validation`; that route calls
 * {@link handleAccessibilityValidation} here.
 *
 * ## Safety (mirrors src/site/traffic*)
 *  - The persist decision is driven by the SITE'S mode, not the request: off /
 *    popup store NOTHING (no-op); only db / popup_db write a row.
 *  - Counts are re-derived server-side from the posted violations
 *    (`summarizeAxeResults`), which also CLAMPS arrays + TRUNCATES strings — a
 *    forged body can neither inflate counts nor store an unbounded blob.
 *  - Per-(session, route) DEDUP (a daily-rotating salted HMAC key, like the
 *    traffic beacon) so a client can't flood rows by re-firing the same page.
 *  - The write is `overrideAccess` from a trusted server route; it is best-effort
 *    and NEVER throws to the visitor (public navigation must not break).
 *  - The stored HTML/failureSummary is admin-read + CSV-exportable; the CSV layer
 *    neutralizes formula injection, and no request PII (raw IP/UA) is persisted.
 */

/** Default dedup window (minutes) for the validation beacon. */
const DEFAULT_DEDUP_WINDOW_MIN = 10

function dedupWindowMs(): number {
  const raw = process.env.ACCESSIBILITY_DEDUP_WINDOW_MIN
  const n = raw === undefined || raw.trim() === '' ? DEFAULT_DEDUP_WINDOW_MIN : Number(raw)
  return (Number.isInteger(n) && n > 0 ? n : DEFAULT_DEDUP_WINDOW_MIN) * 60_000
}

let dedupSingleton: TrafficDedup | null = null
/** The process-wide per-(session,route) dedup for the validation beacon. */
function getValidationDedup(): TrafficDedup {
  if (!dedupSingleton) {
    dedupSingleton = new TrafficDedup(dedupWindowMs())
  }
  return dedupSingleton
}
/** Rebuilds the dedup from CURRENT env and drops state (tests/ops). */
export function resetValidationDedup(): void {
  dedupSingleton = new TrafficDedup(dedupWindowMs())
}

/**
 * A daily-rotating, salted dedup key for a (client, route) pair — a one-way HMAC
 * (stores NO PII even in memory) namespaced `acsvld` so it never collides with
 * the traffic dedup key.
 */
function buildValidationDedupKey(
  clientIp: string | null | undefined,
  userAgent: string | null | undefined,
  route: string,
  now: Date,
): string {
  const secret = process.env.TRAFFIC_SECRET || process.env.PAYLOAD_SECRET || ''
  const day = now.toISOString().slice(0, 10)
  const material = `acsvld:${clientIp ?? 'anon'}:${userAgent ?? ''}:${route}:${day}`
  return createHmac('sha256', secret).update(material).digest('hex')
}

export type ValidationInput = {
  mode: ValidationMode
  tenantId: string | number
  route: string
  screenName: string
  axe: LooseAxeResults
  userAgent?: string | null
  referrer?: string | null
  clientIp?: string | null
}

export type ValidationOutcome = { stored: boolean; id?: string | number; reason?: string }

/** Clamp a client-provided display string to a safe length. */
function clampLabel(v: unknown, max: number): string {
  const s = typeof v === 'string' ? v : ''
  return s.length > max ? s.slice(0, max) : s
}

/**
 * Mode-gated persist core (testable). Returns `{stored:false}` for off/popup;
 * for db/popup_db it dedups, summarizes, and writes ONE row (source `db`).
 * Best-effort: any failure resolves to `{stored:false, reason}` — never throws.
 */
export async function handleAccessibilityValidation(
  payload: Payload,
  input: ValidationInput,
  now: Date = new Date(),
): Promise<ValidationOutcome> {
  if (!validationModeActions(input.mode).storeToDb) {
    return { stored: false, reason: 'mode-no-store' }
  }
  try {
    const route = clampLabel(input.route, 500) || '/'
    const dedupKey = buildValidationDedupKey(input.clientIp, input.userAgent, route, now)
    if (!getValidationDedup().shouldRecord(dedupKey)) {
      return { stored: false, reason: 'deduped' }
    }
    const summary = summarizeAxeResults(input.axe)
    const created = await payload.create({
      collection: 'accessibilityScanResults',
      data: {
        tenant: input.tenantId,
        screenName: clampLabel(input.screenName, 200) || route,
        route,
        source: 'db' satisfies ScanSource,
        inspectedAt: now.toISOString(),
        totalItems: summary.totalItems,
        successCount: summary.successCount,
        errorCount: summary.errorCount,
        criticalCount: summary.criticalCount,
        dangerCount: summary.dangerCount,
        warningCount: summary.warningCount,
        violations: summary.violations,
      } as never,
      overrideAccess: true,
    })
    return { stored: true, id: created.id }
  } catch (err) {
    payload.logger?.warn?.(
      `[accessibility] public validation persist failed: ${(err as Error)?.message}`,
    )
    return { stored: false, reason: 'error' }
  }
}
