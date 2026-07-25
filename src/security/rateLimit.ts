import type { CollectionBeforeOperationHook } from 'payload'
import { APIError } from 'payload'

import { resolveClientIp } from './adminIpEnforcement'

/**
 * Dependency-light, in-memory rate limiter for the PUBLIC unauthenticated
 * endpoints (Task 2D Part 2). Guards the abusable flows — account request,
 * ID/password recovery, and the built-in password-reset submission — against
 * volume abuse (mass enumeration attempts, mail-bombing a victim's inbox via
 * find-password, reset-token hammering).
 *
 * It deliberately does NOT touch authenticated admin traffic or the IP guard:
 * it is wired only into the three custom public endpoints
 * (`src/endpoints/publicAccountEndpoints.ts`) and, via
 * `rateLimitPasswordRecovery`, the built-in `forgotPassword` + `resetPassword`
 * operations (so the IP-guard-exempt `/api/users/forgot-password` route and the
 * GraphQL mutation are covered too, not just our custom endpoint).
 *
 * ## Fixed-window algorithm
 *
 * One counter per `endpoint:clientIp` key, reset every window. Chosen over a
 * token bucket for auditability: a single integer + expiry per key, trivially
 * unit-testable with an injected clock, and "N per window" maps directly to the
 * `PUBLIC_RATE_LIMIT_MAX` / `PUBLIC_RATE_LIMIT_WINDOW_MIN` operator knobs.
 *
 * ## Per-instance caveat (deliberate, documented)
 *
 * The store is a process-local `Map`, so limits are enforced PER RUNNING
 * INSTANCE. Behind multiple app instances / a load balancer the effective limit
 * is `max × instances`. A shared/distributed store (Redis) is a Phase-7 concern
 * — exactly like the OTP brute-force throttle's per-instance note in
 * `twoFactorHooks.ts` — and is intentionally NOT built here.
 *
 * ## Why the key is not trivially spoofable (reuses the T2C trust model)
 *
 * The bucket key is `endpoint:clientIp`, where `clientIp` comes from the T2C
 * {@link resolveClientIp} — which only trusts a forwarded address when the
 * operator has declared the proxy topology via `TRUSTED_PROXY_HOPS`. A naive
 * limiter keyed on the leftmost `X-Forwarded-For` entry would be useless: an
 * attacker rotates a spoofed XFF header and mints a fresh bucket per request,
 * bypassing the limit entirely. Here, when no trustworthy IP is available (no
 * proxy declared, or a spoofed/too-short chain), ALL such requests collapse
 * into a single shared `endpoint:untrusted` bucket, so a spoofer cannot escape
 * their limit. The trade-off — legitimate untrusted clients share one bucket —
 * is the SECURE direction (over-limiting, never under-limiting) and is removed
 * by declaring `TRUSTED_PROXY_HOPS`, the same posture the admin IP guard takes.
 */

/** Default max requests per window when `PUBLIC_RATE_LIMIT_MAX` is unset/invalid. */
export const DEFAULT_PUBLIC_RATE_LIMIT_MAX = 10
/** Default window length (minutes) when `PUBLIC_RATE_LIMIT_WINDOW_MIN` is unset/invalid. */
export const DEFAULT_PUBLIC_RATE_LIMIT_WINDOW_MIN = 10

/** Sentinel client key shared by all requests without a trustworthy IP. */
export const UNTRUSTED_IP_KEY = 'untrusted'

/**
 * Generic 429 message. Carries NO account/existence information — the limiter
 * runs BEFORE any lookup, so a rate-limited find-id/find-password response never
 * reveals whether the queried account exists (ref: T1D generic-response rule).
 */
export const GENERIC_RATE_LIMITED_MESSAGE =
  'Too many requests. Please wait a while before trying again.'

/** Rate-limit endpoint keys (the first segment of every bucket key). */
export const PUBLIC_ENDPOINT_NAMES = {
  accountRequest: 'account-request',
  findId: 'find-id',
  findPassword: 'find-password',
  forgotPassword: 'users/forgot-password',
  resetPassword: 'users/reset-password',
} as const

export type RateLimitConfig = {
  max: number
  windowMs: number
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback
  }
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** Resolves the limiter config from env, falling back to the documented defaults. */
export function getPublicRateLimitConfig(): RateLimitConfig {
  const max = parsePositiveInt(process.env.PUBLIC_RATE_LIMIT_MAX, DEFAULT_PUBLIC_RATE_LIMIT_MAX)
  const windowMin = parsePositiveInt(
    process.env.PUBLIC_RATE_LIMIT_WINDOW_MIN,
    DEFAULT_PUBLIC_RATE_LIMIT_WINDOW_MIN,
  )
  return { max, windowMs: windowMin * 60_000 }
}

export type RateLimitDecision = {
  /** Whether the request is under the limit and may proceed. */
  allowed: boolean
  /** The configured max requests per window. */
  limit: number
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number
  /** Seconds until the current window resets (always >= 1); the Retry-After value. */
  retryAfterSeconds: number
  /** Epoch ms at which the current window resets. */
  resetAt: number
}

type Bucket = {
  count: number
  resetAt: number
}

/**
 * In-memory fixed-window counter. Pure and clock-injectable so it can be
 * unit-tested exhaustively without timers or a running server.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private nextSweepAt = 0

  constructor(
    private readonly config: RateLimitConfig,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Records one hit against `key` and returns the resulting decision. */
  check(key: string): RateLimitDecision {
    const now = this.now()
    this.maybeSweep(now)

    const existing = this.buckets.get(key)
    if (!existing || now >= existing.resetAt) {
      // New window (or first hit): count this request, open a fresh window.
      const fresh: Bucket = { count: 1, resetAt: now + this.config.windowMs }
      this.buckets.set(key, fresh)
      return this.decide(true, fresh, now)
    }

    if (existing.count < this.config.max) {
      existing.count += 1
      return this.decide(true, existing, now)
    }

    // Over the limit — do NOT increment further: a fixed window must keep its
    // `resetAt` stable (blocked requests can't push the reset out), and the
    // count is capped so it can never overflow under sustained abuse.
    return this.decide(false, existing, now)
  }

  private decide(allowed: boolean, bucket: Bucket, now: number): RateLimitDecision {
    return {
      allowed,
      limit: this.config.max,
      remaining: Math.max(0, this.config.max - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
    }
  }

  /**
   * Drops expired buckets so the map can't grow unbounded from one-off IPs.
   * Runs at most once per window (cheap amortized cost on the hot path).
   */
  private maybeSweep(now: number): void {
    if (now < this.nextSweepAt) {
      return
    }
    this.nextSweepAt = now + this.config.windowMs
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key)
      }
    }
  }

  /** Test/ops helper: clears all counters. */
  reset(): void {
    this.buckets.clear()
    this.nextSweepAt = 0
  }

  /** Number of live buckets (for tests/introspection). */
  get size(): number {
    return this.buckets.size
  }
}

let singleton: RateLimiter | null = null

/** The process-wide limiter for the public endpoints (lazily built from env). */
export function getPublicRateLimiter(): RateLimiter {
  if (!singleton) {
    singleton = new RateLimiter(getPublicRateLimitConfig())
  }
  return singleton
}

/**
 * Rebuilds the singleton from the CURRENT env and drops all state. Intended for
 * tests (deterministic isolation between cases) and re-reading changed config.
 */
export function resetPublicRateLimiter(): void {
  singleton = new RateLimiter(getPublicRateLimitConfig())
}

/**
 * Builds the bucket key `endpoint:clientIp`. `clientIp` is resolved through the
 * trusted-proxy model ({@link resolveClientIp}); when no trustworthy IP exists
 * every request shares the single {@link UNTRUSTED_IP_KEY} bucket — see the
 * module doc for why that is the spoof-proof (if conservative) choice.
 */
export function resolveRateLimitKey(endpoint: string, headers: Headers | undefined): string {
  const client = headers ? resolveClientIp(headers) : { ip: undefined, trusted: false }
  const clientKey = client.trusted && client.ip ? client.ip : UNTRUSTED_IP_KEY
  return `${endpoint}:${clientKey}`
}

/** Runs the limiter for `req` against `endpoint`, returning the raw decision. */
export function checkPublicRateLimit(
  req: { headers?: Headers } | undefined,
  endpoint: string,
): RateLimitDecision {
  return getPublicRateLimiter().check(resolveRateLimitKey(endpoint, req?.headers))
}

/**
 * Endpoint gate: returns a ready 429 `Response` (generic body + `Retry-After`
 * and `X-RateLimit-*` headers) when `req` is over the limit for `endpoint`, or
 * `null` when it may proceed. Call this FIRST in a handler — before parsing the
 * body or any account lookup — so a rate-limited response leaks nothing.
 */
export function enforceRateLimit(
  req: { headers?: Headers } | undefined,
  endpoint: string,
): Response | null {
  const decision = checkPublicRateLimit(req, endpoint)
  if (decision.allowed) {
    return null
  }
  return Response.json(
    { ok: false, message: GENERIC_RATE_LIMITED_MESSAGE },
    {
      status: 429,
      headers: {
        'Retry-After': String(decision.retryAfterSeconds),
        'X-RateLimit-Limit': String(decision.limit),
        'X-RateLimit-Remaining': String(decision.remaining),
        'X-RateLimit-Reset': String(Math.ceil(decision.resetAt / 1000)),
      },
    },
  )
}

/**
 * Operation labels for the two built-in password-recovery operations that have
 * no custom endpoint of ours, so they are guarded at the operation seam instead.
 */
const RECOVERY_OPERATION_ENDPOINTS: Partial<Record<string, string>> = {
  forgotPassword: PUBLIC_ENDPOINT_NAMES.forgotPassword,
  resetPassword: PUBLIC_ENDPOINT_NAMES.resetPassword,
}

/**
 * `beforeOperation` hook rate-limiting Payload's built-in password-recovery
 * operations — `forgotPassword` (`POST /api/users/forgot-password` + the
 * `forgotPasswordUser` GraphQL mutation) and `resetPassword`
 * (`POST /api/users/reset-password`). Both operations run their
 * `beforeOperation` collection hooks at the very top (verified in
 * `node_modules/payload/dist/auth/operations/{forgotPassword,resetPassword}.js`),
 * so a throw here aborts BEFORE the account lookup / token check / password
 * hashing — which also keeps the 429 generic (no account-existence leak).
 *
 * ## Why guarding the OPERATION (not just our endpoint) is required
 *
 * The built-in `forgot-password` route and the GraphQL mutation are exempt from
 * the admin IP guard (they must stay reachable for recovery — see
 * `EXEMPT_API_PREFIXES` in `adminIpEnforcement.ts`) and drive
 * `forgotPasswordOperation` DIRECTLY, bypassing our `/api/find-password`
 * endpoint. Rate-limiting only the custom endpoint would leave the
 * "mail-bomb a victim's inbox" vector (Part 2's named goal) wide open via the
 * built-in route. Guarding the operation closes it for every entry point at
 * once — the built-in route, the GraphQL mutation, and our own `findPassword`.
 *
 * ## Deliberate two-layer keying on the find-password path (NOT double-limiting)
 *
 * A request through our `/api/find-password` endpoint counts against TWO
 * DISTINCT buckets: `find-password` (the endpoint gate, which also covers
 * NON-matching enumeration attempts that never reach `forgotPassword`) and
 * `users/forgot-password` (this operation gate, which additionally covers the
 * built-in route + GraphQL). Because the keys differ, one request consumes one
 * slot in each independent window — it does NOT halve a single limit. The two
 * layers measure different things (endpoint volume vs. actual reset-mail sends)
 * and are intentionally kept separate; see the endpoint doc for the rationale.
 *
 * On a real HTTP request `req.headers` carries the forwarding headers, so the
 * trusted-proxy keying applies; a Local-API call (no headers) shares the
 * `untrusted` bucket. The 429 is surfaced as an {@link APIError}; unlike the
 * custom endpoints it cannot attach a `Retry-After` HEADER (APIError carries no
 * headers), but the 429 status + generic message are still returned.
 */
export const rateLimitPasswordRecovery: CollectionBeforeOperationHook = (arg) => {
  const endpoint = RECOVERY_OPERATION_ENDPOINTS[arg.operation]
  if (!endpoint) {
    return
  }
  const decision = checkPublicRateLimit(arg.req as { headers?: Headers }, endpoint)
  if (!decision.allowed) {
    throw new APIError(GENERIC_RATE_LIMITED_MESSAGE, 429)
  }
}
