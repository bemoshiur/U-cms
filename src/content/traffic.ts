/**
 * Public traffic-capture domain helpers (Task 4E; TODO 4.9, feeds Phase 5's
 * statistics — refs 2-17/2-20). Pure of any Payload/Node-crypto runtime so the
 * device-class + referrer rules are unit-testable and shared by the capture
 * seam and (Phase 5) the aggregation.
 *
 * ## Privacy posture (Phase-6-ready — NO PII in traffic logs)
 *
 * The rebuild's traffic log deliberately stores NO raw IP and NO full URLs with
 * query strings. It keeps only:
 *  - the request `path` (no query string — stripped by {@link normalizePath}),
 *  - a coarse `deviceType` (mobile | desktop) derived from the UA string,
 *  - the referrer HOST only (never the full referring URL — {@link referrerHost}),
 *  - a rotating, salted `sessionKey` HASH (computed in `src/site/traffic.ts`,
 *    never here) that cannot be reversed to an IP.
 * This satisfies the Phase-6 privacy subsystem's "no PII in traffic logs" rule
 * (unlike the legacy 사이트 접속 이력 in ref 2-20, which logged the raw IP).
 */

/**
 * Coarse device class from a User-Agent string (ref 2-17's PC/모바일 split).
 * A conservative substring match on the common mobile tokens; everything else
 * (incl. an empty/unknown UA) is `desktop`. Intentionally low-cardinality — no
 * OS/browser/version is derived or stored, so nothing here fingerprints a user.
 */
export function deviceTypeFromUserAgent(
  userAgent: string | null | undefined,
): 'mobile' | 'desktop' {
  if (typeof userAgent !== 'string' || userAgent.length === 0) {
    return 'desktop'
  }
  return /Mobi|Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(
    userAgent,
  )
    ? 'mobile'
    : 'desktop'
}

/**
 * The HOST of a referrer URL (e.g. `search.example.com`), or `null` when the
 * referrer is absent, same-origin-omitted, or unparseable. Deliberately DROPS
 * the referrer's path + query so a visitor's prior browsing detail is never
 * stored — only the coarse "came from which site" dimension survives.
 */
export function referrerHost(referrer: string | null | undefined): string | null {
  if (typeof referrer !== 'string' || referrer.trim() === '') {
    return null
  }
  try {
    const host = new URL(referrer.trim()).host
    return host.length > 0 ? host.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Normalizes a captured path: keeps only the pathname portion (drops any query
 * string / fragment — those can carry identifiers), collapses to `/` when empty,
 * and caps the length. Accepts a full URL or a bare path.
 */
export function normalizePath(rawPath: string | null | undefined): string {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return '/'
  }
  let path = rawPath.trim()
  // If a full URL was supplied, reduce to its pathname.
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname
    }
  } catch {
    // fall through and treat the raw value as a path
  }
  // Strip a query string / fragment from a bare path.
  const q = path.search(/[?#]/)
  if (q >= 0) {
    path = path.slice(0, q)
  }
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  // Guard against pathological lengths (defense in depth against a crafted body).
  return path.slice(0, 512)
}

/**
 * Extracts the per-site menu number from a `/page/{menuNumber}` public path, so
 * the capture can attach the owning `menu` relationship for the ref-2-17
 * per-menu traffic dimension. Returns `null` for any other path (board/post/etc.
 * are attributed by `path` only in this phase). Pure — the DB lookup happens in
 * the capture seam.
 */
export function menuNumberFromPath(path: string): number | null {
  const m = /^\/page\/(\d+)(?:\/|$)/.exec(path)
  if (!m) {
    return null
  }
  const n = Number(m[1])
  return Number.isInteger(n) && n > 0 ? n : null
}
