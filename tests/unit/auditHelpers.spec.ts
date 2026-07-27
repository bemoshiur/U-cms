import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { geoLookup } from '@/audit/geo'
import {
  extractLoginIdentifier,
  extractRelationIds,
  normalizeIp,
  resolveActorLabel,
  resolveIpAddress,
} from '@/audit/helpers'
import { isMobileUserAgent } from '@/audit/userAgent'

/** Builds a minimal PayloadRequest-like object with the given headers/data. */
function fakeReq(headers: Record<string, string> = {}, data?: Record<string, unknown>) {
  return {
    headers: new Headers(headers),
    data,
  } as unknown as PayloadRequest
}

describe('normalizeIp', () => {
  it('keeps a plain IPv4 address', () => {
    expect(normalizeIp('192.168.0.1')).toBe('192.168.0.1')
  })

  it('keeps a genuine IPv6 address', () => {
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1')
  })

  it('collapses an IPv4-mapped IPv6 address', () => {
    expect(normalizeIp('::ffff:192.168.0.1')).toBe('192.168.0.1')
  })

  it('unwraps a bracketed IPv6 literal', () => {
    expect(normalizeIp('[::1]')).toBe('::1')
  })

  it('trims whitespace', () => {
    expect(normalizeIp('  10.0.0.5  ')).toBe('10.0.0.5')
  })
})

describe('resolveIpAddress', () => {
  it('prefers the first hop of x-forwarded-for', () => {
    const req = fakeReq({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })
    expect(resolveIpAddress(req)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip', () => {
    const req = fakeReq({ 'x-real-ip': '198.51.100.9' })
    expect(resolveIpAddress(req)).toBe('198.51.100.9')
  })

  it('normalizes the resolved value', () => {
    const req = fakeReq({ 'x-forwarded-for': '::ffff:127.0.0.1' })
    expect(resolveIpAddress(req)).toBe('127.0.0.1')
  })

  it('returns undefined when no source is present', () => {
    expect(resolveIpAddress(fakeReq())).toBeUndefined()
  })
})

/**
 * Task 7A #5 — audit IP capture converges on the hardened, TRUSTED_PROXY_HOPS-
 * aware resolver. When a proxy is declared the audit row records the trusted
 * (Nth-from-the-right) hop, not the spoofable leftmost XFF; when unset the
 * original best-observed behavior is preserved.
 */
describe('resolveIpAddress — TRUSTED_PROXY_HOPS convergence', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('unset (default): keeps the original leftmost-XFF behavior', () => {
    // No stub → hops=0 → fall back to observed leftmost hop (unchanged).
    const req = fakeReq({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })
    expect(resolveIpAddress(req)).toBe('203.0.113.7')
  })

  it('hops=2: returns the trusted 2nd-from-right hop, NOT the spoofable leftmost', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2')
    // Attacker prepends "1.1.1.1"; the app has 2 trusted hops, so the client is
    // the 2nd-from-right entry (2.2.2.2), never the forged leftmost.
    const req = fakeReq({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' })
    expect(resolveIpAddress(req)).toBe('2.2.2.2')
  })

  it('hops=1: trusts x-real-ip when there is no XFF', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1')
    const req = fakeReq({ 'x-real-ip': '198.51.100.9' })
    expect(resolveIpAddress(req)).toBe('198.51.100.9')
  })

  it('hops declared but chain shorter than declared: refuses to fall back (undefined)', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '3')
    const req = fakeReq({ 'x-forwarded-for': '9.9.9.9' })
    expect(resolveIpAddress(req)).toBeUndefined()
  })
})

describe('resolveActorLabel', () => {
  it('formats name(loginId)', () => {
    expect(resolveActorLabel({ id: 1, name: '강현아', loginId: 'hasung' })).toBe('강현아(hasung)')
  })

  it('falls back to email as the id token', () => {
    expect(resolveActorLabel({ id: 1, name: 'Jane', email: 'jane@x.com' })).toBe('Jane(jane@x.com)')
  })

  it('degrades to just the id when there is no name', () => {
    expect(resolveActorLabel({ id: 7, loginId: 'solo' })).toBe('solo')
  })

  it('returns undefined for an anonymous/absent actor', () => {
    expect(resolveActorLabel(null)).toBeUndefined()
    expect(resolveActorLabel(undefined)).toBeUndefined()
  })
})

describe('extractLoginIdentifier', () => {
  it('reads email from the request body, never the password', () => {
    const req = fakeReq({}, { email: 'bad@x.com', password: 'secret' })
    expect(extractLoginIdentifier(req)).toBe('bad@x.com')
  })

  it('returns undefined when no identifier is present', () => {
    expect(extractLoginIdentifier(fakeReq())).toBeUndefined()
  })
})

describe('extractRelationIds', () => {
  it('normalizes bare ids and populated docs, de-duplicating', () => {
    expect(extractRelationIds([1, { id: 2 }, 2, { id: 3 }])).toEqual([1, 2, 3])
  })

  it('returns [] for non-arrays', () => {
    expect(extractRelationIds(undefined)).toEqual([])
    expect(extractRelationIds(null)).toEqual([])
  })
})

describe('isMobileUserAgent', () => {
  it('flags common mobile UAs', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true)
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14)')).toBe(true)
  })

  it('does not flag desktop UAs or empty', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe(false)
    expect(isMobileUserAgent(undefined)).toBe(false)
  })
})

describe('geoLookup (stub — default domestic)', () => {
  it('classifies every address as domestic until a GeoIP provider is wired', () => {
    expect(geoLookup('203.0.113.7')).toBe(false)
    expect(geoLookup(undefined)).toBe(false)
  })
})
