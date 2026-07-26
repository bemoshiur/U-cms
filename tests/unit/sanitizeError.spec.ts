import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  collectEnvSecretValues,
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
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

  // ── C1 regression — the exact adversarial shapes the brief named ──────────
  it('redacts DB connection-string userinfo credentials (postgres/mysql)', () => {
    const pg = sanitizeErrorMessage(
      'connect failed postgres://appuser:pw123@db.host:5432/app timeout',
    )
    expect(pg).not.toContain('pw123')
    expect(pg).not.toContain('appuser:pw123')
    const my = sanitizeErrorMessage('mysql://root:toor@127.0.0.1:3306/app is down')
    expect(my).not.toContain('toor')
  })

  it('redacts PAYLOAD_SECRET and other env-style secret keys', () => {
    expect(sanitizeErrorMessage('boot failed PAYLOAD_SECRET=abc123def')).not.toContain('abc123def')
    expect(sanitizeErrorMessage('S3_SECRET_ACCESS_KEY=zzzKEYvalue')).not.toContain('zzzKEYvalue')
    expect(sanitizeErrorMessage('SMTP_PASS=hunter2pass')).not.toContain('hunter2pass')
    expect(sanitizeErrorMessage('SURVEY_PARTICIPANT_SECRET=svsecret9')).not.toContain('svsecret9')
  })

  it('redacts compound camelCase/snake_case token params', () => {
    expect(sanitizeErrorMessage('resetToken=deadbeefdeadbeef1234')).not.toContain('deadbeef')
    expect(sanitizeErrorMessage('access_token=xyz987tok')).not.toContain('xyz987tok')
    expect(sanitizeErrorMessage('refreshToken=rrr111tok')).not.toContain('rrr111tok')
    expect(sanitizeErrorMessage('failed with apiKey=kkk222val')).not.toContain('kkk222val')
    expect(sanitizeErrorMessage('/cb?code=1&access_token=leaked99')).not.toContain('leaked99')
  })

  it('redacts a DATABASE_URI value whole (key + userinfo)', () => {
    const out = sanitizeErrorMessage('DATABASE_URI=postgres://u:secretpw@h:5432/db')
    expect(out).not.toContain('secretpw')
  })

  it('C1 — scrubs ALL brief-named secret shapes in one message (fails without the fix)', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sigsigsigsig'
    const msg =
      `postgres://u:pw123@h/db PAYLOAD_SECRET=sekret99 resetToken=deadbeefdeadbeefdeadbeef ` +
      `Bearer ${jwt} alice@example.com DATABASE_URI=mysql://r:toorpw@h/a`
    const out = sanitizeErrorMessage(msg)
    for (const secret of [
      'pw123',
      'sekret99',
      'deadbeefdeadbeefdeadbeef',
      jwt,
      'alice@example.com',
      'toorpw',
    ]) {
      expect(out).not.toContain(secret)
    }
    expect(out).toContain('[REDACTED]')
  })

  it('C1 — the SAME scrub applies to the stack digest', () => {
    const stack =
      'Error: fail\n    at q (postgres://u:pw@h/db)\n    at r (PAYLOAD_SECRET=abc123 resetToken=deadbeef1234abcd)'
    const digest = sanitizeStack(stack)!
    expect(digest).not.toContain('pw@h')
    expect(digest).not.toContain('abc123')
    expect(digest).not.toContain('deadbeef1234abcd')
    expect(digest).toContain('[REDACTED]')
  })

  // ── Re-review: ReDoS bound + 3 remaining bypasses (fail-without-fix) ───────
  it('ReDoS — a 256KB adversarial input completes in bounded time + is truncated', () => {
    // Worst case for the term-anchored KEY regex: the term ("secret") occurs at
    // every position but a separator NEVER follows — maximal failed backtracking.
    // 256KB is cut to the 64KB size-guard before scrubbing, keeping it bounded.
    const evil = 'secret_'.repeat(Math.floor((256 * 1024) / 7)) // ~256KB
    const t0 = performance.now()
    const out = sanitizeErrorMessage(evil)
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(100)
    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_LEN + 1)
    // A JSON-ish adversarial input (quotes + colons, no closing value) at 256KB.
    const evil2 = '{"password":'.repeat(Math.floor((256 * 1024) / 12))
    const t1 = performance.now()
    sanitizeErrorMessage(evil2)
    expect(performance.now() - t1).toBeLessThan(100)
  })

  it('bypass 1 — a DB-URI password containing @ is FULLY redacted (up to the last @)', () => {
    const out = sanitizeErrorMessage('connect postgres://user:p@ss@host:5432/db failed')
    expect(out).not.toContain('p@ss')
    expect(out).not.toContain('ss@host') // the leaked tail from the old first-@ match
    expect(out).toContain('@host') // host authority preserved
  })

  it('bypass 2 — JSON-shaped "password":"value" is redacted', () => {
    expect(sanitizeErrorMessage('body {"password":"hunter2"} rejected')).not.toContain('hunter2')
    expect(sanitizeErrorMessage('{"apiKey":"live_ABC999"}')).not.toContain('live_ABC999')
    expect(sanitizeErrorMessage('{"secret": "topsecretval"}')).not.toContain('topsecretval')
  })

  it('bypass 3 — a URL-encoded separator (%3D / %3A) does not bypass redaction', () => {
    expect(sanitizeErrorMessage('/cb?resetToken%3Ddeadbeefcafe')).not.toContain('deadbeefcafe')
    expect(sanitizeErrorMessage('access_token%3Aleakedval99')).not.toContain('leakedval99')
  })

  // ── Round-3: straddle, spaced values, env-value pass, Basic/Digest ─────────
  it('NEW-1 — a URI whose @ sits past the old 8KB pre-cap is still redacted (straddle fixed)', () => {
    const pad = 'x'.repeat(8180) // pushes the URI @ to offset ~8200 (> the old 8192 pre-cap)
    const out = sanitizeErrorMessage(`${pad} postgres://dbuser:strdlpw@dbhost:5432/app failed`)
    expect(out).not.toContain('strdlpw')
    expect(out).not.toContain('dbuser:strdlpw')
  })

  it('NEW-2 — a QUOTED sensitive value with spaces is FULLY redacted (double + single)', () => {
    expect(sanitizeErrorMessage('rejected password="my secret pass phrase" here')).not.toContain(
      'secret pass',
    )
    expect(sanitizeErrorMessage("passphrase='correct horse battery staple' invalid")).not.toContain(
      'correct horse battery staple',
    )
    // The env-assignment (KEY = value with spaces) shape.
    expect(sanitizeErrorMessage('boot PAYLOAD_SECRET = a longsecret value here now')).not.toContain(
      'longsecret value here',
    )
  })

  it('NEW-3 — Basic / Digest auth credentials are redacted (like Bearer)', () => {
    expect(sanitizeErrorMessage('401 Authorization: Basic dXNlcjpwYXNzd29yZA==')).not.toContain(
      'dXNlcjpwYXNzd29yZA',
    )
    expect(
      sanitizeErrorMessage('Authorization: Digest username="x", response=abc123def'),
    ).not.toContain('abc123def')
  })

  it('PRIMARY — the app’s own env-secret VALUES are redacted verbatim (any format)', () => {
    vi.stubEnv('PAYLOAD_SECRET', 'super-signing-secret-abc123xyz')
    vi.stubEnv('DATABASE_URI', 'postgres://u:realdbpw@prod-host/appdb')
    vi.stubEnv('SOME_API_TOKEN', 'tok_live_zzz99887766')
    // Injected mid-message in an UNUSUAL format the heuristics might miss.
    const msg =
      'crash dump >> [super-signing-secret-abc123xyz] and cfg=postgres://u:realdbpw@prod-host/appdb ; tok_live_zzz99887766'
    const out = sanitizeErrorMessage(msg)
    expect(out).not.toContain('super-signing-secret-abc123xyz')
    expect(out).not.toContain('realdbpw')
    expect(out).not.toContain('tok_live_zzz99887766')
    // The scrub also applies to the stack digest.
    expect(sanitizeStack(`Error\n    at x (super-signing-secret-abc123xyz)`)).not.toContain(
      'super-signing-secret-abc123xyz',
    )
  })

  it('collectEnvSecretValues — selects secret-named vars, ignores short/non-secret ones', () => {
    const env = {
      PAYLOAD_SECRET: 'a-long-signing-secret',
      DATABASE_URI: 'postgres://u:pw@h/db',
      SOME_TOKEN: 'tok-abcdefgh',
      NODE_ENV: 'production', // not a secret name
      SHORT_SECRET: 'abc', // too short (< 8)
      PUBLIC_URL: 'https://example.com',
    }
    const values = collectEnvSecretValues(env)
    expect(values).toContain('a-long-signing-secret')
    expect(values).toContain('postgres://u:pw@h/db')
    expect(values).toContain('tok-abcdefgh')
    expect(values).not.toContain('production')
    expect(values).not.toContain('abc')
    expect(values).not.toContain('https://example.com')
    // Longest-first so a longer secret is replaced before a shorter overlapping one.
    expect(values[0]!.length).toBeGreaterThanOrEqual(values[values.length - 1]!.length)
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
