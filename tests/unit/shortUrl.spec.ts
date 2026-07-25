import { describe, expect, it } from 'vitest'

import {
  generateShortCode,
  isValidRedirectTarget,
  SHORT_CODE_LENGTH,
  SHORT_CODE_PATTERN,
} from '@/content/shortUrl'
import { classifyAdminPath } from '@/security/adminIpEnforcement'

describe('generateShortCode (Task 3D short URLs)', () => {
  it('produces an 8-char alphanumeric code by default', () => {
    const code = generateShortCode()
    expect(code).toHaveLength(SHORT_CODE_LENGTH)
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/)
  })

  it('honors a custom length', () => {
    expect(generateShortCode(12)).toHaveLength(12)
  })

  it('is effectively unique across many generations', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateShortCode()))
    // 62^8 space — 500 draws should never collide.
    expect(codes.size).toBe(500)
  })
})

describe('SHORT_CODE_PATTERN', () => {
  it('accepts valid codes and rejects malformed ones', () => {
    expect(SHORT_CODE_PATTERN.test('abcD1234')).toBe(true)
    expect(SHORT_CODE_PATTERN.test('abc')).toBe(false) // too short
    expect(SHORT_CODE_PATTERN.test('abc/../x')).toBe(false)
    expect(SHORT_CODE_PATTERN.test('abc def')).toBe(false)
  })
})

describe('isValidRedirectTarget (open-redirect / scheme guard)', () => {
  it('accepts absolute http(s) URLs (the intended short-link case)', () => {
    expect(isValidRedirectTarget('https://example.com/x')).toBe(true)
    expect(isValidRedirectTarget('http://example.com')).toBe(true)
  })

  it('accepts genuine site-relative internal targets', () => {
    expect(isValidRedirectTarget('/bos/home')).toBe(true)
    expect(isValidRedirectTarget('?menuSn=1')).toBe(true)
  })

  it('rejects dangerous schemes and protocol-relative values', () => {
    expect(isValidRedirectTarget('javascript:alert(1)')).toBe(false)
    expect(isValidRedirectTarget('data:text/html,x')).toBe(false)
    expect(isValidRedirectTarget('//evil.com')).toBe(false)
    expect(isValidRedirectTarget('/\\evil.com')).toBe(false)
    expect(isValidRedirectTarget('relative/path')).toBe(false)
    expect(isValidRedirectTarget('')).toBe(false)
    expect(isValidRedirectTarget(null)).toBe(false)
  })
})

describe('short-URL public route is exempt from the admin IP guard', () => {
  it('classifies /api/s/:code as exempt', () => {
    expect(classifyAdminPath('/api/s/abc123')).toBe('exempt')
    expect(classifyAdminPath('/api/s')).toBe('exempt')
  })

  it('still guards other /api paths (control)', () => {
    expect(classifyAdminPath('/api/boards')).toBe('guard')
  })
})
