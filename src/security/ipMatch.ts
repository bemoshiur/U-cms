/**
 * Pure IP-matching + rule-pattern validation for the admin IP access-control
 * list (Task 2C; feature-inventory refs 1-20 / 1-21). No I/O, no Payload — kept
 * standalone so it can be unit-tested exhaustively and reused by both the
 * `ipAddress` field validator (`AdminIpRules`) and the default-deny guard
 * (`ipAccessGuard.ts`).
 *
 * Supported rule-pattern shapes (everything else is rejected by
 * `isValidRulePattern`):
 *   - bare `*`                     → matches ALL clients (IPv4 and IPv6).
 *   - exact IPv4                   → `203.0.113.7`.
 *   - IPv4 trailing-wildcard octets→ `10.*`, `10.0.*`, `192.168.0.*`
 *                                    (the `*` must be a suffix — `10.*.0.1` is
 *                                    rejected).
 *   - exact IPv6                   → any valid IPv6 literal; `::`-compression
 *                                    and IPv4-mapped forms are normalized so
 *                                    `::1` ≡ `0:0:0:0:0:0:0:1` and
 *                                    `::ffff:192.168.0.1` ≡ `192.168.0.1`.
 *
 * There are deliberately NO IPv6 wildcard patterns (legacy only ever used IPv4
 * wildcards + bare `*`); an IPv6 rule is always an exact host.
 */

/** Parses a dotted-quad string into four octets, or null if malformed/out of range. */
function ipv4Octets(str: string): [number, number, number, number] | null {
  const m = str.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) {
    return null
  }
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const
  if (octets.some((n) => n > 255)) {
    return null
  }
  return [octets[0], octets[1], octets[2], octets[3]]
}

/**
 * Reduces a client address to a plain dotted-quad IPv4 string when it *is* IPv4
 * — including an IPv4-mapped IPv6 client (`::ffff:192.168.0.1` in either the
 * dotted or the hex `::ffff:c0a8:1` form, which dual-stack sockets emit).
 * Returns null for a genuine (non-mapped) IPv6 address.
 */
function toClientIpv4(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1)
  }
  if (ipv4Octets(s)) {
    return s
  }
  const dottedMapped = s.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dottedMapped?.[1] && ipv4Octets(dottedMapped[1])) {
    return dottedMapped[1]
  }
  const hexMapped = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hexMapped?.[1] && hexMapped[2]) {
    const hi = parseInt(hexMapped[1], 16)
    const lo = parseInt(hexMapped[2], 16)
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
  }
  return null
}

/**
 * Canonicalizes an IPv6 literal to a fully-expanded, zero-stripped,
 * lowercase 8-group form (e.g. `::1` → `0:0:0:0:0:0:0:1`) so two textually
 * different spellings of the same address compare equal. Returns null if the
 * input is not a valid IPv6 address (including plain IPv4, which has no colon).
 */
export function canonicalizeIpv6(input: string): string | null {
  let s = input.trim().toLowerCase()
  if (s.startsWith('[') && s.endsWith(']')) {
    s = s.slice(1, -1)
  }
  if (!s.includes(':')) {
    return null
  }

  // Fold a trailing embedded IPv4 (`::ffff:1.2.3.4`, `::1.2.3.4`) into two hex
  // groups so the rest of the routine only deals with hextets.
  if (s.includes('.')) {
    const lastColon = s.lastIndexOf(':')
    if (lastColon === -1) {
      return null
    }
    const oct = ipv4Octets(s.slice(lastColon + 1))
    if (!oct) {
      return null
    }
    const g1 = ((oct[0] << 8) | oct[1]).toString(16)
    const g2 = ((oct[2] << 8) | oct[3]).toString(16)
    s = `${s.slice(0, lastColon + 1)}${g1}:${g2}`
  }

  const halves = s.split('::')
  if (halves.length > 2) {
    return null
  }

  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null

  const hexGroup = /^[0-9a-f]{1,4}$/
  for (const g of [...head, ...(tail ?? [])]) {
    if (!hexGroup.test(g)) {
      return null
    }
  }

  let groups: string[]
  if (tail === null) {
    if (head.length !== 8) {
      return null
    }
    groups = head
  } else {
    const missing = 8 - (head.length + tail.length)
    if (missing < 1) {
      return null
    }
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail]
  }

  if (groups.length !== 8) {
    return null
  }
  return groups.map((g) => parseInt(g, 16).toString(16)).join(':')
}

/**
 * True if `pattern` is a valid IPv4 rule — either an exact dotted-quad or a
 * trailing-wildcard form (`10.*`, `10.0.*`, `192.168.0.*`). The `*` groups must
 * be a contiguous suffix and there must be at least one concrete leading octet
 * (a bare `*` is handled separately by callers).
 */
function isIpv4Pattern(pattern: string): boolean {
  const segs = pattern.split('.')
  if (segs.length < 2 || segs.length > 4) {
    return false
  }
  const starIdx = segs.indexOf('*')
  if (starIdx === -1) {
    // Exact IPv4 must be a full dotted-quad.
    return segs.length === 4 && ipv4Octets(pattern) !== null
  }
  if (starIdx === 0) {
    return false // needs at least one concrete leading octet
  }
  // Every segment from the first `*` onward must also be `*` (trailing only)…
  if (!segs.slice(starIdx).every((s) => s === '*')) {
    return false
  }
  // …and every segment before it a valid octet.
  return segs.slice(0, starIdx).every((s) => /^\d{1,3}$/.test(s) && Number(s) <= 255)
}

/** Matches a dotted-quad client against a valid IPv4 rule (exact or trailing-wildcard). */
function ipv4PatternMatches(clientV4: string, pattern: string): boolean {
  const cSegs = clientV4.split('.')
  const pSegs = pattern.split('.')
  for (let i = 0; i < pSegs.length; i++) {
    if (pSegs[i] === '*') {
      return true // trailing wildcard covers every remaining octet
    }
    if (Number(pSegs[i]) !== Number(cSegs[i])) {
      return false
    }
  }
  return true
}

/**
 * Core predicate: does `clientIp` satisfy `rulePattern`?
 *
 * An empty/absent `clientIp` matches ONLY the bare `*` rule — so an
 * unidentifiable client (no proxy forwarding its address) is treated as "any
 * IP" and is therefore covered by a `*` allow but by no specific allow, which
 * is the intended default-deny behavior (see `ipAccessGuard.ts`).
 */
export function ipMatches(clientIp: string | undefined, rulePattern: string): boolean {
  const pattern = (rulePattern ?? '').trim()
  if (!pattern) {
    return false
  }
  if (pattern === '*') {
    return true
  }

  const rawIp = (clientIp ?? '').trim()
  if (!rawIp) {
    return false
  }

  if (isIpv4Pattern(pattern)) {
    const clientV4 = toClientIpv4(rawIp)
    return clientV4 !== null && ipv4PatternMatches(clientV4, pattern)
  }

  const a = canonicalizeIpv6(rawIp)
  const b = canonicalizeIpv6(pattern)
  return a !== null && b !== null && a === b
}

/**
 * Rule-pattern validator backing the `ipAddress` field's custom `validate`
 * (`AdminIpRules`). Accepts bare `*`, exact/trailing-wildcard IPv4, and exact
 * IPv6; rejects everything else.
 */
export function isValidRulePattern(pattern: string): boolean {
  const p = (pattern ?? '').trim()
  if (p === '*') {
    return true
  }
  if (isIpv4Pattern(p)) {
    return true
  }
  return canonicalizeIpv6(p) !== null
}
