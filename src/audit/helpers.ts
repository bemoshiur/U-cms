import type { PayloadRequest } from 'payload'

import { toRelationId } from '../collections/utils'
import { getTrustedProxyHops, normalizeIp, resolveClientIp } from '../security/clientIp'

/**
 * Shared, mostly-pure resolvers used by every audit writer (Task 2A). Kept
 * separate from the writers so they can be unit/integration-tested in
 * isolation and reused by the auth hooks, the collection-audit factory, and
 * the permission-change journals without a dependency cycle.
 */

// `normalizeIp` now lives in the shared, dependency-free `clientIp` module so a
// SINGLE implementation backs both the admin IP enforcement layer and this
// audit-log capture (Task 7A #5). Re-exported here for the existing importers.
export { normalizeIp }

/**
 * Resolves the client IP for an AUDIT-LOG row from the request. Payload's
 * `PayloadRequest` is a Web `Request` (not an Express request), so there is no
 * built-in `req.ip`; the authoritative source is the proxy headers.
 *
 * ## Trusted-proxy convergence (Task 7A #5)
 *
 * Historically this trusted the LEFTMOST `x-forwarded-for` hop, which a client
 * can spoof by prepending entries — so a forged "192.168.0.1" would be written
 * verbatim into the audit trail. It now routes through the SAME hardened
 * `resolveClientIp` the admin IP-enforcement layer uses: when
 * `TRUSTED_PROXY_HOPS` is set (>0) the audit row records the trusted-proxy-
 * correct client IP (the Nth-from-the-right XFF entry / X-Real-IP), NOT the
 * spoofable leftmost hop.
 *
 * When `TRUSTED_PROXY_HOPS` is UNSET (the default, hops=0) behavior is IDENTICAL
 * to before: `resolveClientIp` cannot trust a header, so we fall back to the
 * observed leftmost XFF → X-Real-IP → `req.ip`. This is deliberate and safe for
 * a LOG LABEL (a diagnostic field, not an access decision — the enforcement
 * layer, which DOES make decisions, treats an untrusted IP as unusable). So the
 * audit trail keeps recording the best-observed client address in dev/unset
 * deployments while gaining spoof-resistance the moment a proxy is declared.
 */
export function resolveIpAddress(req: PayloadRequest | undefined): string | undefined {
  const get = (header: string): string | undefined => {
    try {
      return req?.headers?.get?.(header) ?? undefined
    } catch {
      return undefined
    }
  }

  // Prefer a TRUSTED client IP when a proxy is declared (TRUSTED_PROXY_HOPS>0).
  // `resolveClientIp` only ever calls `.get(header)`, so any Headers-like object
  // (a real `Headers` or a test mock exposing `.get`) works.
  const headers = (req as { headers?: { get?: unknown } } | undefined)?.headers
  if (headers && typeof headers.get === 'function' && getTrustedProxyHops() > 0) {
    const trusted = resolveClientIp(headers as Headers)
    if (trusted.trusted && trusted.ip) {
      return trusted.ip
    }
    // Trusted proxy declared but the chain didn't yield a trustworthy hop → do
    // NOT fall back to a spoofable header (that would defeat the hardening);
    // leave the field unresolved.
    return undefined
  }

  // No trusted proxy declared → preserve the original best-observed behavior.
  const forwardedFor = get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) {
      return normalizeIp(first)
    }
  }

  const realIp = get('x-real-ip')
  if (realIp && realIp.trim()) {
    return normalizeIp(realIp)
  }

  const maybeIp = (req as { ip?: unknown } | undefined)?.ip
  if (typeof maybeIp === 'string' && maybeIp.trim()) {
    return normalizeIp(maybeIp)
  }

  return undefined
}

/**
 * Builds the denormalized `name(id)` actor snapshot stored on every log row so
 * the record survives later deletion of the user (ref 1-55 / 3-1 store real
 * identity). Prefers the legacy `loginId` as the id token, falling back to the
 * email, then the raw DB id. Degrades gracefully to just the name or just the
 * id when only one is known, and returns `undefined` for an
 * anonymous/system/absent actor.
 */
export function resolveActorLabel(actor: unknown): string | undefined {
  if (!actor || typeof actor !== 'object') {
    return undefined
  }
  const a = actor as Record<string, unknown>
  const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : undefined
  const idToken =
    (typeof a.loginId === 'string' && a.loginId ? a.loginId : undefined) ??
    (typeof a.email === 'string' && a.email ? a.email : undefined) ??
    (a.id !== undefined && a.id !== null ? String(a.id) : undefined)

  if (name && idToken) {
    return `${name}(${idToken})`
  }
  return name ?? idToken ?? undefined
}

/**
 * The session's login timestamp, for session reconstruction (ref 1-55 callout
 * 7 "로그인일시", ref 3-1 "최초 접속일시"). Approximated by the acting user's
 * `lastLoginAt` (stamped on every login by `recordLastLogin`), which is the
 * current session's start for all practical purposes. Precise per-session
 * reconstruction via the JWT `sid`/`users_sessions.createdAt` is deferred (see
 * task-2A-report.md).
 */
export function resolveSessionLoginAt(req: PayloadRequest | undefined): string | undefined {
  const last = (req?.user as { lastLoginAt?: unknown } | undefined)?.lastLoginAt
  if (typeof last === 'string') {
    return last
  }
  if (last instanceof Date) {
    return last.toISOString()
  }
  return undefined
}

/**
 * Extracts the attempted login identifier from a request body for the
 * failed-login path (`afterError`). Reads `req.data` (populated by Payload
 * before the login operation runs — see the login REST handler, which itself
 * reads `req.data.email`). Never touches `password`.
 */
export function extractLoginIdentifier(req: PayloadRequest | undefined): string | undefined {
  const data = req?.data as Record<string, unknown> | undefined
  for (const key of ['email', 'loginId', 'username'] as const) {
    const value = data?.[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

/** Reads the `user-agent` header, or `undefined` if absent. */
export function getUserAgent(req: PayloadRequest | undefined): string | undefined {
  try {
    return req?.headers?.get?.('user-agent') ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Normalizes an array of relationship values (bare ids or populated docs) to a
 * de-duplicated list of ids, using the shared `toRelationId`. Used by the
 * permission-change journals to diff before/after `roles` and `menuGrants`.
 */
export function extractRelationIds(value: unknown): Array<number | string> {
  if (!Array.isArray(value)) {
    return []
  }
  const ids: Array<number | string> = []
  for (const entry of value) {
    const id = toRelationId(entry)
    if ((typeof id === 'number' || typeof id === 'string') && !ids.some((x) => sameId(x, id))) {
      ids.push(id)
    }
  }
  return ids
}

/** Id equality that tolerates number/string mismatches (Postgres ids are integers here). */
export function sameId(a: number | string, b: number | string): boolean {
  return String(a) === String(b)
}
