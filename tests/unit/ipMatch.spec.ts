import { describe, expect, it } from 'vitest'

import { canonicalizeIpv6, ipMatches, isValidRulePattern } from '@/security/ipMatch'

/**
 * Exhaustive unit coverage for the pure IP matcher + rule-pattern validator
 * (Task 2C; feature-inventory refs 1-20/1-21). No Payload, no DB.
 */
describe('ipMatches', () => {
  describe('exact IPv4', () => {
    it('matches an identical address and rejects a different one', () => {
      expect(ipMatches('203.0.113.7', '203.0.113.7')).toBe(true)
      expect(ipMatches('203.0.113.8', '203.0.113.7')).toBe(false)
      expect(ipMatches('203.0.113.7', '203.0.113.70')).toBe(false)
    })
  })

  describe('IPv4 trailing-wildcard octets', () => {
    it('192.168.0.* covers .1 through .255 but not the next subnet', () => {
      expect(ipMatches('192.168.0.1', '192.168.0.*')).toBe(true)
      expect(ipMatches('192.168.0.255', '192.168.0.*')).toBe(true)
      expect(ipMatches('192.168.1.1', '192.168.0.*')).toBe(false)
    })

    it('192.168.* covers the whole /16', () => {
      expect(ipMatches('192.168.0.1', '192.168.*')).toBe(true)
      expect(ipMatches('192.168.255.255', '192.168.*')).toBe(true)
      expect(ipMatches('192.169.0.1', '192.168.*')).toBe(false)
    })

    it('10.* covers the whole /8', () => {
      expect(ipMatches('10.0.0.1', '10.*')).toBe(true)
      expect(ipMatches('10.255.255.255', '10.*')).toBe(true)
      expect(ipMatches('11.0.0.1', '10.*')).toBe(false)
    })
  })

  describe('bare * = all IPs', () => {
    it('matches any IPv4, any IPv6, and even an unknown/empty client', () => {
      expect(ipMatches('203.0.113.7', '*')).toBe(true)
      expect(ipMatches('::1', '*')).toBe(true)
      expect(ipMatches(undefined, '*')).toBe(true)
      expect(ipMatches('', '*')).toBe(true)
    })
  })

  describe('IPv6 exact with normalization', () => {
    it('normalizes :: compression — ::1 equals its fully-expanded form', () => {
      expect(ipMatches('::1', '::1')).toBe(true)
      expect(ipMatches('::1', '0:0:0:0:0:0:0:1')).toBe(true)
      expect(ipMatches('0:0:0:0:0:0:0:1', '::1')).toBe(true)
    })

    it('normalizes mid-address compression and leading zeros', () => {
      expect(ipMatches('2001:db8::1', '2001:db8:0:0:0:0:0:1')).toBe(true)
      expect(ipMatches('2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::1')).toBe(true)
    })

    it('does not match different IPv6 addresses', () => {
      expect(ipMatches('::2', '::1')).toBe(false)
      expect(ipMatches('2001:db8::1', '::1')).toBe(false)
    })
  })

  describe('IPv4-mapped IPv6 clients (::ffff:)', () => {
    it('a mapped client matches the plain IPv4 rule (dotted and hex forms)', () => {
      expect(ipMatches('::ffff:192.168.0.1', '192.168.0.1')).toBe(true)
      expect(ipMatches('::ffff:192.168.0.1', '192.168.0.*')).toBe(true)
      expect(ipMatches('::ffff:c0a8:1', '192.168.0.1')).toBe(true)
    })

    it('a mapped client that does NOT match the rule is rejected', () => {
      expect(ipMatches('::ffff:192.168.0.1', '192.168.1.*')).toBe(false)
    })
  })

  describe('cross-family and empties', () => {
    it('an IPv4 rule never matches a genuine IPv6 client and vice versa', () => {
      expect(ipMatches('::1', '127.0.0.1')).toBe(false)
      expect(ipMatches('127.0.0.1', '::1')).toBe(false)
    })

    it('an empty/undefined client matches only *', () => {
      expect(ipMatches('', '127.0.0.1')).toBe(false)
      expect(ipMatches(undefined, '192.168.0.*')).toBe(false)
    })

    it('an empty pattern never matches', () => {
      expect(ipMatches('127.0.0.1', '')).toBe(false)
    })
  })
})

describe('isValidRulePattern', () => {
  it('accepts *, exact IPv4, IPv4 trailing wildcards, and exact IPv6', () => {
    for (const p of [
      '*',
      '127.0.0.1',
      '203.0.113.255',
      '10.*',
      '10.0.*',
      '192.168.0.*',
      '::1',
      '2001:db8::1',
      '::ffff:192.168.0.1',
      'fe80::1',
    ]) {
      expect(isValidRulePattern(p)).toBe(true)
    }
  })

  it('rejects malformed patterns, non-trailing wildcards, CIDR, and out-of-range octets', () => {
    for (const p of [
      '',
      '   ',
      'abc',
      '256.1.1.1',
      '192.168',
      '10.*.0.1', // wildcard not trailing
      '*.0.0.1', // wildcard not trailing (leading)
      '192.168.0.0/24', // CIDR unsupported
      '1.2.3.4.5',
      'gggg::1',
    ]) {
      expect(isValidRulePattern(p)).toBe(false)
    }
  })
})

describe('canonicalizeIpv6 (helper)', () => {
  it('expands and normalizes, and returns null for non-IPv6', () => {
    expect(canonicalizeIpv6('::1')).toBe('0:0:0:0:0:0:0:1')
    expect(canonicalizeIpv6('2001:DB8::1')).toBe('2001:db8:0:0:0:0:0:1')
    expect(canonicalizeIpv6('[::1]')).toBe('0:0:0:0:0:0:0:1')
    expect(canonicalizeIpv6('127.0.0.1')).toBeNull()
    expect(canonicalizeIpv6('not-an-ip')).toBeNull()
  })
})
