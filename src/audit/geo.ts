/**
 * Geo-IP classification seam (Task 2A Part 3; feature-inventory ref 3-5
 * 해외여부 / "Overseas Y/N"). The legacy Privacy system flags each login
 * attempt as overseas or domestic; the dedicated "overseas login attempt
 * history" screen is just a filtered view of `loginHistory` on this flag.
 *
 * A real GeoIP database (MaxMind or similar) is a later concern
 * (development-plan §2.5 / Phase 7). This stub wires the seam **now** — every
 * caller already routes its resolved IP through `geoLookup()` — but defaults
 * every address to domestic (`false`) until the real lookup is dropped in.
 * Swapping in a real implementation is then a one-file change with no caller
 * churn.
 */
export function geoLookup(_ipAddress: string | undefined): boolean {
  // Default-domestic until a real GeoIP provider is wired (Phase 7).
  return false
}
