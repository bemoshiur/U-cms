import type { PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PUBLIC_RATE_LIMIT_MAX,
  DEFAULT_PUBLIC_RATE_LIMIT_WINDOW_MIN,
  GENERIC_RATE_LIMITED_MESSAGE,
  PUBLIC_ENDPOINT_NAMES,
  RateLimiter,
  UNTRUSTED_IP_KEY,
  enforceRateLimit,
  getPublicRateLimitConfig,
  resetPublicRateLimiter,
  resolveRateLimitKey,
} from '@/security/rateLimit'
import {
  accountRequestEndpoint,
  findIdEndpoint,
  findPasswordEndpoint,
} from '@/endpoints/publicAccountEndpoints'

/**
 * Pure-logic coverage for the Task 2D public-endpoint rate limiter. No Payload,
 * no DB — the class uses an injected clock, and the endpoint tests drive the
 * real handlers with a fake request + a "poison" payload that throws if the
 * rate-limit gate ever lets business logic run.
 */

function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init)
}

describe('RateLimiter (fixed window, injected clock)', () => {
  it('allows exactly `max` requests then blocks the next one', () => {
    let now = 1_000
    const limiter = new RateLimiter({ max: 3, windowMs: 60_000 }, () => now)

    const d1 = limiter.check('k')
    const d2 = limiter.check('k')
    const d3 = limiter.check('k')
    const d4 = limiter.check('k')

    expect(d1).toMatchObject({ allowed: true, remaining: 2 })
    expect(d2).toMatchObject({ allowed: true, remaining: 1 })
    expect(d3).toMatchObject({ allowed: true, remaining: 0 })
    expect(d4.allowed).toBe(false)
    expect(d4.remaining).toBe(0)
    expect(d4.limit).toBe(3)
  })

  it('computes Retry-After as whole seconds to the window reset (>= 1)', () => {
    let now = 0
    const limiter = new RateLimiter({ max: 1, windowMs: 10_000 }, () => now)
    limiter.check('k') // opens window, resetAt = 10_000
    now = 2_500
    const blocked = limiter.check('k')
    expect(blocked.allowed).toBe(false)
    // (10_000 - 2_500) / 1000 = 7.5 -> ceil -> 8
    expect(blocked.retryAfterSeconds).toBe(8)
    expect(blocked.resetAt).toBe(10_000)
  })

  it('resets the counter once the window elapses', () => {
    let now = 0
    const limiter = new RateLimiter({ max: 2, windowMs: 1_000 }, () => now)
    expect(limiter.check('k').allowed).toBe(true)
    expect(limiter.check('k').allowed).toBe(true)
    expect(limiter.check('k').allowed).toBe(false)

    now = 1_000 // window boundary reached -> fresh window
    const afterReset = limiter.check('k')
    expect(afterReset.allowed).toBe(true)
    expect(afterReset.remaining).toBe(1)
  })

  it('keys buckets independently and prunes expired ones', () => {
    let now = 0
    const limiter = new RateLimiter({ max: 1, windowMs: 1_000 }, () => now)
    expect(limiter.check('a').allowed).toBe(true)
    expect(limiter.check('b').allowed).toBe(true)
    expect(limiter.check('a').allowed).toBe(false) // 'a' exhausted
    expect(limiter.check('b').allowed).toBe(false) // 'b' exhausted, independent
    expect(limiter.size).toBe(2)

    // Advance past the window; the next check sweeps the expired buckets.
    now = 5_000
    limiter.check('c')
    expect(limiter.size).toBe(1) // a + b pruned, only fresh c remains
  })

  it('reset() clears all state', () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1_000 })
    limiter.check('k')
    expect(limiter.check('k').allowed).toBe(false)
    limiter.reset()
    expect(limiter.check('k').allowed).toBe(true)
  })
})

describe('getPublicRateLimitConfig (env parsing)', () => {
  const prevMax = process.env.PUBLIC_RATE_LIMIT_MAX
  const prevWin = process.env.PUBLIC_RATE_LIMIT_WINDOW_MIN
  afterEach(() => {
    if (prevMax === undefined) delete process.env.PUBLIC_RATE_LIMIT_MAX
    else process.env.PUBLIC_RATE_LIMIT_MAX = prevMax
    if (prevWin === undefined) delete process.env.PUBLIC_RATE_LIMIT_WINDOW_MIN
    else process.env.PUBLIC_RATE_LIMIT_WINDOW_MIN = prevWin
  })

  it('defaults when unset and rejects non-positive / non-integer values', () => {
    delete process.env.PUBLIC_RATE_LIMIT_MAX
    delete process.env.PUBLIC_RATE_LIMIT_WINDOW_MIN
    expect(getPublicRateLimitConfig()).toEqual({
      max: DEFAULT_PUBLIC_RATE_LIMIT_MAX,
      windowMs: DEFAULT_PUBLIC_RATE_LIMIT_WINDOW_MIN * 60_000,
    })

    for (const bad of ['0', '-5', 'abc', '1.5', '']) {
      process.env.PUBLIC_RATE_LIMIT_MAX = bad
      process.env.PUBLIC_RATE_LIMIT_WINDOW_MIN = bad
      expect(getPublicRateLimitConfig()).toEqual({
        max: DEFAULT_PUBLIC_RATE_LIMIT_MAX,
        windowMs: DEFAULT_PUBLIC_RATE_LIMIT_WINDOW_MIN * 60_000,
      })
    }

    process.env.PUBLIC_RATE_LIMIT_MAX = '25'
    process.env.PUBLIC_RATE_LIMIT_WINDOW_MIN = '5'
    expect(getPublicRateLimitConfig()).toEqual({ max: 25, windowMs: 5 * 60_000 })
  })
})

describe('resolveRateLimitKey (reuses the trusted-proxy model)', () => {
  const prevHops = process.env.TRUSTED_PROXY_HOPS
  afterEach(() => {
    if (prevHops === undefined) delete process.env.TRUSTED_PROXY_HOPS
    else process.env.TRUSTED_PROXY_HOPS = prevHops
  })

  it('with no trusted proxy (hops=0), every request shares one untrusted bucket', () => {
    delete process.env.TRUSTED_PROXY_HOPS
    const a = resolveRateLimitKey('find-id', headers({ 'x-forwarded-for': '203.0.113.1' }))
    const b = resolveRateLimitKey('find-id', headers({ 'x-forwarded-for': '203.0.113.2' }))
    // A spoofer cannot rotate XFF to escape the limit — both collapse to one key.
    expect(a).toBe(`find-id:${UNTRUSTED_IP_KEY}`)
    expect(b).toBe(a)
  })

  it('with a trusted proxy (hops=1), distinct client IPs get distinct buckets', () => {
    process.env.TRUSTED_PROXY_HOPS = '1'
    const a = resolveRateLimitKey('find-id', headers({ 'x-forwarded-for': '203.0.113.1' }))
    const b = resolveRateLimitKey('find-id', headers({ 'x-forwarded-for': '203.0.113.2' }))
    expect(a).toBe('find-id:203.0.113.1')
    expect(b).toBe('find-id:203.0.113.2')
    expect(a).not.toBe(b)
  })

  it('ignores a spoofed leftmost XFF entry (same trusted IP -> same bucket)', () => {
    process.env.TRUSTED_PROXY_HOPS = '1'
    const spoofed = resolveRateLimitKey(
      'find-id',
      headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }),
    )
    const plain = resolveRateLimitKey('find-id', headers({ 'x-forwarded-for': '203.0.113.7' }))
    expect(spoofed).toBe('find-id:203.0.113.7')
    expect(plain).toBe(spoofed)
  })

  it('keys per endpoint (same IP, different endpoint -> different bucket)', () => {
    process.env.TRUSTED_PROXY_HOPS = '1'
    const id = resolveRateLimitKey('find-id', headers({ 'x-forwarded-for': '203.0.113.7' }))
    const pw = resolveRateLimitKey('find-password', headers({ 'x-forwarded-for': '203.0.113.7' }))
    expect(id).not.toBe(pw)
  })
})

describe('enforceRateLimit (429 Response shape)', () => {
  const prevMax = process.env.PUBLIC_RATE_LIMIT_MAX
  const prevHops = process.env.TRUSTED_PROXY_HOPS

  beforeEach(() => {
    process.env.PUBLIC_RATE_LIMIT_MAX = '2'
    process.env.TRUSTED_PROXY_HOPS = '1'
    resetPublicRateLimiter()
  })
  afterEach(() => {
    if (prevMax === undefined) delete process.env.PUBLIC_RATE_LIMIT_MAX
    else process.env.PUBLIC_RATE_LIMIT_MAX = prevMax
    if (prevHops === undefined) delete process.env.TRUSTED_PROXY_HOPS
    else process.env.TRUSTED_PROXY_HOPS = prevHops
    resetPublicRateLimiter()
  })

  it('returns null under the limit and a well-formed 429 over it', async () => {
    const req = { headers: headers({ 'x-forwarded-for': '198.51.100.5' }) }

    expect(enforceRateLimit(req, PUBLIC_ENDPOINT_NAMES.findId)).toBeNull()
    expect(enforceRateLimit(req, PUBLIC_ENDPOINT_NAMES.findId)).toBeNull()

    const res = enforceRateLimit(req, PUBLIC_ENDPOINT_NAMES.findId)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(429)
    expect(res!.headers.get('Retry-After')).toBeTruthy()
    expect(Number(res!.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
    expect(res!.headers.get('X-RateLimit-Limit')).toBe('2')
    expect(res!.headers.get('X-RateLimit-Remaining')).toBe('0')

    const body = (await res!.json()) as { ok: boolean; message: string }
    expect(body.ok).toBe(false)
    expect(body.message).toBe(GENERIC_RATE_LIMITED_MESSAGE)
  })
})

describe('public endpoints return a generic 429 without touching business logic', () => {
  const prevMax = process.env.PUBLIC_RATE_LIMIT_MAX
  const prevHops = process.env.TRUSTED_PROXY_HOPS

  beforeEach(() => {
    process.env.PUBLIC_RATE_LIMIT_MAX = '3'
    process.env.TRUSTED_PROXY_HOPS = '1'
    resetPublicRateLimiter()
  })
  afterEach(() => {
    if (prevMax === undefined) delete process.env.PUBLIC_RATE_LIMIT_MAX
    else process.env.PUBLIC_RATE_LIMIT_MAX = prevMax
    if (prevHops === undefined) delete process.env.TRUSTED_PROXY_HOPS
    else process.env.TRUSTED_PROXY_HOPS = prevHops
    resetPublicRateLimiter()
  })

  /** A payload that fails the test if any property is accessed. */
  function poisonPayload(): unknown {
    return new Proxy(
      {},
      {
        get() {
          throw new Error('business logic must not run for a rate-limited request')
        },
      },
    )
  }

  const cases = [
    { name: 'account-request', endpoint: accountRequestEndpoint, ip: '198.51.100.10' },
    { name: 'find-id', endpoint: findIdEndpoint, ip: '198.51.100.11' },
    { name: 'find-password', endpoint: findPasswordEndpoint, ip: '198.51.100.12' },
  ]

  for (const { name, endpoint, ip } of cases) {
    it(`${name}: over-limit request gets a generic 429 and never reaches payload`, async () => {
      const jsonSpy = vi.fn(async () => ({}))
      const req = {
        headers: headers({ 'x-forwarded-for': ip }),
        payload: poisonPayload(),
        json: jsonSpy,
      } as unknown as PayloadRequest

      // Exhaust the window (max=3), so the 4th call must be blocked.
      const key = resolveRateLimitKey(name, req.headers)
      const limiter = (await import('@/security/rateLimit')).getPublicRateLimiter()
      for (let i = 0; i < 3; i++) limiter.check(key)

      const res = await endpoint.handler!(req)
      expect(res.status).toBe(429)
      const body = (await res.json()) as { ok: boolean; message: string }
      expect(body.ok).toBe(false)
      expect(body.message).toBe(GENERIC_RATE_LIMITED_MESSAGE)
      // Neither the JSON body nor payload was ever touched — no existence leak,
      // no work performed for a rejected request.
      expect(jsonSpy).not.toHaveBeenCalled()
    })
  }
})

describe('find-id / find-password stay generic across the limit boundary', () => {
  const prevMax = process.env.PUBLIC_RATE_LIMIT_MAX
  const prevHops = process.env.TRUSTED_PROXY_HOPS

  beforeEach(() => {
    process.env.PUBLIC_RATE_LIMIT_MAX = '2'
    process.env.TRUSTED_PROXY_HOPS = '1'
    resetPublicRateLimiter()
  })
  afterEach(() => {
    if (prevMax === undefined) delete process.env.PUBLIC_RATE_LIMIT_MAX
    else process.env.PUBLIC_RATE_LIMIT_MAX = prevMax
    if (prevHops === undefined) delete process.env.TRUSTED_PROXY_HOPS
    else process.env.TRUSTED_PROXY_HOPS = prevHops
    resetPublicRateLimiter()
  })

  it('under the limit returns the generic message; over it returns the generic 429', async () => {
    // A benign payload whose `find` reports NO match (the enumeration-safe path):
    // find-id/find-password must return their generic success message either way.
    const benignPayload = {
      find: async () => ({ docs: [] }),
      sendEmail: async () => undefined,
      forgotPassword: async () => 'token',
    }
    const makeReq = (): PayloadRequest =>
      ({
        headers: headers({ 'x-forwarded-for': '203.0.113.44' }),
        payload: benignPayload,
        json: async () => ({ name: 'Nobody', loginId: 'nobody', email: 'nobody@example.com' }),
      }) as unknown as PayloadRequest

    // max=2 → first two allowed (generic 200), third blocked (generic 429).
    const r1 = await findIdEndpoint.handler!(makeReq())
    const r2 = await findIdEndpoint.handler!(makeReq())
    const r3 = await findIdEndpoint.handler!(makeReq())

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(r3.status).toBe(429)

    const b1 = (await r1.json()) as { ok: boolean; message: string }
    const b3 = (await r3.json()) as { ok: boolean; message: string }
    expect(b1.ok).toBe(true)
    expect(b1.message).toMatch(/if an active account matches/i) // generic, no existence signal
    expect(b3.message).toBe(GENERIC_RATE_LIMITED_MESSAGE)
  })
})
