/**
 * Shared, dependency-free client-IP primitives (Task 7A #5 — resolver
 * convergence). Extracted so BOTH the hardened admin IP-enforcement layer
 * (`src/security/adminIpEnforcement.ts`) AND the audit-log IP capture
 * (`src/audit/helpers.ts`) resolve the client IP through ONE implementation,
 * without a circular import (audit/helpers ↔ adminIpEnforcement ↔ recordAccess ↔
 * audit/helpers). This module imports nothing internal, so it can never be part
 * of a cycle.
 *
 * The `TRUSTED_PROXY_HOPS` trust model lives here in full; the enforcement layer
 * and the audit layer both consume it (the enforcement layer for an access
 * DECISION, the audit layer for a diagnostic LABEL — see `resolveIpAddress`).
 */

/**
 * Normalizes a raw IP string for **wildcard-free** storage (ref 1-55 business
 * rule: "IP examples show both LAN (192.168.0.1) and localhost (127.0.0.1)
 * captured as-is" — the concrete request address, never a wildcard/CIDR range
 * like the IP *access-control* collection stores). Trims whitespace, unwraps a
 * bracketed IPv6 literal (`[::1]` → `::1`), and collapses an IPv4-mapped IPv6
 * address (`::ffff:192.168.0.1` → `192.168.0.1`, which Node commonly produces
 * on a dual-stack socket) so IPv4 clients read as plain IPv4. Both plain IPv4
 * and genuine IPv6 addresses are otherwise preserved verbatim.
 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim()
  if (ip.startsWith('[')) {
    const close = ip.indexOf(']')
    if (close !== -1) {
      ip = ip.slice(1, close)
    }
  }
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (mapped && mapped[1]) {
    ip = mapped[1]
  }
  return ip
}

/**
 * Number of trusted reverse-proxy hops in front of the app. `0` (default, and
 * any non-positive/invalid value) means "no trusted proxy" — forwarding headers
 * are not trusted for enforcement decisions.
 */
export function getTrustedProxyHops(): number {
  const raw = (process.env.TRUSTED_PROXY_HOPS ?? '').trim()
  if (raw === '') {
    return 0
  }
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 0
}

export type ResolvedClientIp = {
  /** The resolved client IP, or `undefined` when none could be trusted. */
  ip: string | undefined
  /** Whether `ip` came from a trusted source (a declared proxy hop). */
  trusted: boolean
}

/**
 * Resolves a TRUSTWORTHY client IP from proxy headers, honoring
 * `TRUSTED_PROXY_HOPS`. Returns `{ trusted: false }` whenever no trustworthy
 * address is available (no proxy declared, chain shorter than declared, etc.) —
 * the enforcement layer decides what to do with an untrusted request. A
 * `NextRequest` has no socket `req.ip`, so headers are the only source.
 */
export function resolveClientIp(headers: Headers, hops = getTrustedProxyHops()): ResolvedClientIp {
  if (hops <= 0) {
    // No trusted proxy configured → XFF/X-Real-IP are client-spoofable.
    return { ip: undefined, trusted: false }
  }

  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    // The Nth-from-the-right entry is the one your own trusted proxy appended;
    // entries to its left are attacker-controllable and must be ignored.
    const idx = parts.length - hops
    const candidate = idx >= 0 ? parts[idx] : undefined
    if (candidate) {
      return { ip: normalizeIp(candidate), trusted: true }
    }
    // Chain shorter than the declared hop count → cannot trust anything.
    return { ip: undefined, trusted: false }
  }

  // No XFF but a single trusted hop that sets X-Real-IP (e.g. nginx directly in
  // front) → trust it only when exactly one hop is declared.
  if (hops === 1) {
    const realIp = headers.get('x-real-ip')
    if (realIp && realIp.trim()) {
      return { ip: normalizeIp(realIp.trim()), trusted: true }
    }
  }

  return { ip: undefined, trusted: false }
}
