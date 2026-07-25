import { describe, expect, it } from 'vitest'

import { safeRedirect } from '@/security/safeRedirect'

/**
 * Unit coverage for the post-login redirect-target sanitizer
 * (security-review fix, open redirect: `LoginView.tsx`'s original
 * `startsWith('/') && !startsWith('//')` check missed backslash-based
 * protocol-relative forms like `/\evil.com`, which browsers normalize to
 * `//evil.com`). No Payload, no DB.
 *
 * `BACKSLASH` is built via `String.fromCharCode` rather than a `\`
 * character literal so the malicious fixtures below are unambiguous about
 * exactly which byte they contain.
 */

const BACKSLASH = String.fromCharCode(92)
const CONTROL_CHAR = String.fromCharCode(1) // arbitrary C0 control (not tab/CR/LF-specific)

const FALLBACK = '/admin'

describe('safeRedirect', () => {
  describe('rejects unsafe targets (falls back to the safe default)', () => {
    it('rejects a protocol-relative //host', () => {
      expect(safeRedirect('//evil.com', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a leading /\\ (slash-backslash) that browsers normalize to //host', () => {
      const value = '/' + BACKSLASH + 'evil.com'
      expect(value).toBe('/\\evil.com')
      expect(safeRedirect(value, FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a leading /\\/ (slash-backslash-slash) that browsers normalize to //host', () => {
      const value = '/' + BACKSLASH + '/evil.com'
      expect(value).toBe('/\\/evil.com')
      expect(safeRedirect(value, FALLBACK)).toBe(FALLBACK)
    })

    it('rejects an absolute https URL', () => {
      expect(safeRedirect('https://evil.com', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a javascript: URL', () => {
      expect(safeRedirect('javascript:alert(1)', FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a bare \\\\host (no leading slash, all backslashes)', () => {
      const value = BACKSLASH + BACKSLASH + 'evil.com'
      expect(value).toBe('\\\\evil.com')
      expect(safeRedirect(value, FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a value with a leading control character', () => {
      const value = CONTROL_CHAR + '/admin'
      expect(safeRedirect(value, FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a value with an embedded control character', () => {
      const value = '/admin' + CONTROL_CHAR + '/evil'
      expect(safeRedirect(value, FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a non-string / empty / missing value', () => {
      expect(safeRedirect('', FALLBACK)).toBe(FALLBACK)
      expect(safeRedirect(undefined, FALLBACK)).toBe(FALLBACK)
    })

    it('rejects a value not starting with /', () => {
      expect(safeRedirect('evil.com', FALLBACK)).toBe(FALLBACK)
    })

    it('takes only the first entry of an array value, and still validates it', () => {
      expect(safeRedirect(['//evil.com', '/admin'], FALLBACK)).toBe(FALLBACK)
    })
  })

  describe('accepts legitimate same-origin relative paths', () => {
    it('accepts /admin', () => {
      expect(safeRedirect('/admin', FALLBACK)).toBe('/admin')
    })

    it('accepts /admin/collections/posts', () => {
      expect(safeRedirect('/admin/collections/posts', FALLBACK)).toBe('/admin/collections/posts')
    })

    it('accepts / (root)', () => {
      expect(safeRedirect('/', FALLBACK)).toBe('/')
    })

    it('passes through an array value whose first entry is safe', () => {
      expect(safeRedirect(['/admin/collections/posts'], FALLBACK)).toBe('/admin/collections/posts')
    })
  })
})
