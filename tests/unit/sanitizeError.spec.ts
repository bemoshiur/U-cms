import { describe, expect, it } from 'vitest'

import {
  MAX_MESSAGE_LEN,
  resolveExceptionClass,
  sanitizeErrorMessage,
  sanitizeStack,
  scrubSensitive,
  userAgentFamilyFromUserAgent,
} from '@/audit/sanitizeError'

/**
 * Task 5C — pure error sanitization + classification (refs 1-56..1-59). The
 * scrub is the SECURITY line for the error log (admin-readable + exportable), so
 * these assert both that secrets/PII are redacted AND that ordinary messages
 * survive unmangled.
 */

describe('scrubSensitive / sanitizeErrorMessage — redaction', () => {
  it('redacts password / token / secret key=value pairs (=, :, quoted)', () => {
    const out = sanitizeErrorMessage('login failed password=hunter2 and token: abc123 apiKey="zzz"')
    expect(out).not.toContain('hunter2')
    expect(out).not.toContain('abc123')
    expect(out).not.toContain('zzz')
    expect(out).toContain('[REDACTED]')
  })

  it('redacts an Authorization bearer token', () => {
    const out = sanitizeErrorMessage('request rejected: Authorization: Bearer sk_live_abcDEF123456')
    expect(out).not.toContain('sk_live_abcDEF123456')
    expect(out).toContain('[REDACTED]')
  })

  it('redacts a JWT-shaped token', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N'
    const out = sanitizeErrorMessage(`auth error with ${jwt} present`)
    expect(out).not.toContain(jwt)
    expect(out).toContain('[REDACTED]')
  })

  it('redacts email addresses (PII)', () => {
    const out = sanitizeErrorMessage('user alice.smith@example.co.kr was not found')
    expect(out).not.toContain('alice.smith@example.co.kr')
    expect(out).toContain('[REDACTED]')
  })

  it('redacts long hex / base64 opaque blobs', () => {
    const hex = 'deadbeefdeadbeefdeadbeefdeadbeef01'
    expect(sanitizeErrorMessage(`digest ${hex}`)).not.toContain(hex)
  })

  it('leaves an ordinary message untouched (no false redaction)', () => {
    const msg = 'Cannot read properties of undefined (reading id)'
    expect(sanitizeErrorMessage(msg)).toBe(msg)
    expect(scrubSensitive(msg)).toBe(msg)
  })

  it('degrades an empty/non-string message to a stable placeholder', () => {
    expect(sanitizeErrorMessage('')).toBe('(no message)')
    expect(sanitizeErrorMessage(undefined)).toBe('(no message)')
    expect(sanitizeErrorMessage(null)).toBe('(no message)')
  })

  it('caps an over-long message', () => {
    // Repeated short word (not one long blob, which the secret-scrub would redact).
    const out = sanitizeErrorMessage('word '.repeat(MAX_MESSAGE_LEN))
    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_LEN + 1)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('sanitizeStack', () => {
  it('scrubs secrets in stack frames and truncates to the top frames', () => {
    const frames = Array.from({ length: 60 }, (_, i) => `    at fn${i} (/app/x.ts:${i}:1)`)
    const stack = ['Error: token=supersecret123', ...frames].join('\n')
    const digest = sanitizeStack(stack)!
    expect(digest).not.toContain('supersecret123')
    expect(digest).toContain('[REDACTED]')
    // Top 30 frames only.
    expect(digest.split('\n').length).toBeLessThanOrEqual(30)
    expect(digest).not.toContain('fn40')
  })

  it('returns undefined for an absent stack', () => {
    expect(sanitizeStack(undefined)).toBeUndefined()
    expect(sanitizeStack('')).toBeUndefined()
  })
})

describe('resolveExceptionClass', () => {
  it('uses the error constructor name', () => {
    expect(resolveExceptionClass(new TypeError('x'))).toBe('TypeError')
    expect(resolveExceptionClass(new Error('x'))).toBe('Error')
    class CustomError extends Error {}
    expect(resolveExceptionClass(new CustomError('x'))).toBe('CustomError')
  })

  it('handles non-Error values + strips unsafe characters', () => {
    expect(resolveExceptionClass('boom')).toBe('StringError')
    expect(resolveExceptionClass({ name: 'Weird<Name>=1' })).toBe('WeirdName1')
    expect(resolveExceptionClass(undefined)).toBe('UnknownError')
    expect(resolveExceptionClass(null)).toBe('UnknownError')
  })
})

describe('userAgentFamilyFromUserAgent', () => {
  it('produces a coarse os/browser family (no version)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
    expect(userAgentFamilyFromUserAgent(ua)).toBe('windows/chrome')
  })

  it('returns undefined for an absent UA', () => {
    expect(userAgentFamilyFromUserAgent(undefined)).toBeUndefined()
    expect(userAgentFamilyFromUserAgent('')).toBeUndefined()
  })
})
