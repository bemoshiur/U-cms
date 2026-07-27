/**
 * Year-month helpers for the standardization self-check (Phase 8, Task 8.1b;
 * ref 1-75). Snapshots are keyed by a `YYYYMM` string (점검연월). The self-check
 * "Run Check" only ever (re)writes the CURRENT year-month; earlier months are
 * reference-only, so a single authoritative `currentYearMonth()` is shared by
 * the write-guard hook, the run-check endpoint, and the seed.
 */

/** The current check year-month as `YYYYMM` (UTC-stable, deterministic). */
export function currentYearMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  return `${y}${String(m).padStart(2, '0')}`
}

/** True iff `ym` is a well-formed `YYYYMM` string. */
export function isYearMonth(ym: string | null | undefined): boolean {
  return (
    typeof ym === 'string' &&
    /^\d{6}$/.test(ym) &&
    Number(ym.slice(4)) >= 1 &&
    Number(ym.slice(4)) <= 12
  )
}

/** `YYYYMM` → a display label `YYYY-MM`. */
export function formatYearMonth(ym: string): string {
  return isYearMonth(ym) ? `${ym.slice(0, 4)}-${ym.slice(4)}` : ym
}
