import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  classifyAdminPath,
  getTrustedProxyHops,
  isAdminIpEnforcementDisabled,
  resolveClientIp,
} from '@/security/adminIpEnforcement'

/**
 * Pure-logic coverage for the trust model + path classification (Task 2C
 * security-review fixes). No Payload, no DB.
 */

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('getTrustedProxyHops', () => {
  const prev = process.env.TRUSTED_PROXY_HOPS
  afterEach(() => {
    if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS
    else process.env.TRUSTED_PROXY_HOPS = prev
  })

  it('defaults to 0 and rejects non-positive / non-integer values', () => {
    delete process.env.TRUSTED_PROXY_HOPS
    expect(getTrustedProxyHops()).toBe(0)
    for (const [raw, expected] of [
      ['', 0],
      ['0', 0],
      ['-1', 0],
      ['abc', 0],
      ['1.5', 0],
      ['1', 1],
      ['3', 3],
    ] as const) {
      process.env.TRUSTED_PROXY_HOPS = raw
      expect(getTrustedProxyHops()).toBe(expected)
    }
  })
})

describe('resolveClientIp (trusted-proxy model)', () => {
  it('with 0 hops, NEVER trusts forwarding headers (spoof-proof by refusal)', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': '203.0.113.7' }), 0)).toEqual({
      ip: undefined,
      trusted: false,
    })
    expect(resolveClientIp(headers({ 'x-real-ip': '203.0.113.7' }), 0)).toEqual({
      ip: undefined,
      trusted: false,
    })
  })

  it('with 1 hop, takes the RIGHTMOST XFF entry (the one your proxy appended)', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': '203.0.113.7' }), 1)).toEqual({
      ip: '203.0.113.7',
      trusted: true,
    })
  })

  it('a spoofed extra leftmost XFF entry cannot be selected when hops=1', () => {
    // Attacker prepends an allowlisted-looking IP; the proxy appends the real one.
    const resolved = resolveClientIp(headers({ 'x-forwarded-for': '127.0.0.1, 8.8.8.8' }), 1)
    expect(resolved).toEqual({ ip: '8.8.8.8', trusted: true })
  })

  it('with N hops, takes the Nth-from-the-right (spoofed prefix ignored)', () => {
    // XFF = spoofed, realClient, proxyA ; 2 trusted hops → index len-2 = realClient
    const resolved = resolveClientIp(
      headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.7, 10.0.0.1' }),
      2,
    )
    expect(resolved).toEqual({ ip: '203.0.113.7', trusted: true })
  })

  it('untrusted when the chain is shorter than the declared hop count', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': '203.0.113.7' }), 2)).toEqual({
      ip: undefined,
      trusted: false,
    })
  })

  it('trusts X-Real-IP only when exactly one hop is declared and no XFF present', () => {
    expect(resolveClientIp(headers({ 'x-real-ip': '203.0.113.7' }), 1)).toEqual({
      ip: '203.0.113.7',
      trusted: true,
    })
    expect(resolveClientIp(headers({ 'x-real-ip': '203.0.113.7' }), 2)).toEqual({
      ip: undefined,
      trusted: false,
    })
  })

  it('normalizes an IPv4-mapped IPv6 forwarded address', () => {
    expect(resolveClientIp(headers({ 'x-forwarded-for': '::ffff:192.168.0.9' }), 1)).toEqual({
      ip: '192.168.0.9',
      trusted: true,
    })
  })
})

describe('classifyAdminPath (media is fully guarded — B2)', () => {
  it('GUARDS /api/media/file/* AND the media collection REST endpoints', () => {
    // B2 (phase-3-final-review §2): the file route is no longer exempt — it
    // held secret/cross-tenant board attachments. Phase 4 will re-open a
    // deliberate public path with a tenant/secret-aware split.
    expect(classifyAdminPath('/api/media/file/logo.png')).toBe('guard')
    expect(classifyAdminPath('/api/media')).toBe('guard')
    expect(classifyAdminPath('/api/media/123')).toBe('guard')
  })

  it('guards /admin and /api generally, exempts recovery + public frontend', () => {
    expect(classifyAdminPath('/admin')).toBe('guard')
    expect(classifyAdminPath('/admin/login')).toBe('guard')
    expect(classifyAdminPath('/api/users/login')).toBe('guard')
    expect(classifyAdminPath('/admin/forgot')).toBe('exempt')
    expect(classifyAdminPath('/api/find-password')).toBe('exempt')
    expect(classifyAdminPath('/')).toBe('exempt')
    expect(classifyAdminPath('/some-frontend-page')).toBe('exempt')
  })
})

describe('isAdminIpEnforcementDisabled', () => {
  const prev = process.env.ADMIN_IP_ENFORCEMENT
  beforeEach(() => {
    delete process.env.ADMIN_IP_ENFORCEMENT
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.ADMIN_IP_ENFORCEMENT
    else process.env.ADMIN_IP_ENFORCEMENT = prev
  })

  it('is enabled by default and disabled by off/false/0/no', () => {
    expect(isAdminIpEnforcementDisabled()).toBe(false)
    for (const v of ['off', 'FALSE', '0', 'no', 'Off']) {
      process.env.ADMIN_IP_ENFORCEMENT = v
      expect(isAdminIpEnforcementDisabled()).toBe(true)
    }
    for (const v of ['on', 'true', '1', 'yes']) {
      process.env.ADMIN_IP_ENFORCEMENT = v
      expect(isAdminIpEnforcementDisabled()).toBe(false)
    }
  })
})
