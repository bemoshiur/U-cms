import { describe, expect, it } from 'vitest'

import {
  deviceTypeFromUserAgent,
  menuNumberFromPath,
  normalizePath,
  referrerHost,
} from '@/content/traffic'

describe('traffic capture helpers (Task 4E — privacy-conscious)', () => {
  describe('deviceTypeFromUserAgent', () => {
    it('classifies common mobile UAs as mobile', () => {
      const mobileUAs = [
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605',
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537 Mobile Safari/537',
        'Mozilla/5.0 (iPad; CPU OS 16) AppleWebKit',
      ]
      for (const ua of mobileUAs) {
        expect(deviceTypeFromUserAgent(ua)).toBe('mobile')
      }
    })

    it('classifies desktop UAs (and empty/unknown) as desktop', () => {
      expect(
        deviceTypeFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605'),
      ).toBe('desktop')
      expect(deviceTypeFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
      expect(deviceTypeFromUserAgent('')).toBe('desktop')
      expect(deviceTypeFromUserAgent(null)).toBe('desktop')
      expect(deviceTypeFromUserAgent(undefined)).toBe('desktop')
    })
  })

  describe('referrerHost (keeps only the host — no path/query/PII)', () => {
    it('extracts the host, dropping path + query', () => {
      expect(referrerHost('https://search.example.com/results?q=secret+term')).toBe(
        'search.example.com',
      )
      expect(referrerHost('http://Foo.Example.ORG/a/b')).toBe('foo.example.org')
    })

    it('returns null for absent / unparseable referrers', () => {
      expect(referrerHost('')).toBeNull()
      expect(referrerHost(null)).toBeNull()
      expect(referrerHost(undefined)).toBeNull()
      expect(referrerHost('not a url')).toBeNull()
    })
  })

  describe('normalizePath (strips query/fragment — no identifiers)', () => {
    it('keeps the pathname only', () => {
      expect(normalizePath('/page/12?utm=abc&token=xyz')).toBe('/page/12')
      expect(normalizePath('/board/B1#frag')).toBe('/board/B1')
      expect(normalizePath('https://demo.example.com/page/7?x=1')).toBe('/page/7')
    })

    it('forces a leading slash and defaults blank to /', () => {
      expect(normalizePath('page/3')).toBe('/page/3')
      expect(normalizePath('')).toBe('/')
      expect(normalizePath(null)).toBe('/')
    })

    it('caps pathological lengths', () => {
      expect(normalizePath('/' + 'a'.repeat(2000)).length).toBeLessThanOrEqual(512)
    })

    it('B2 — collapses a token-bearing reset-password path to a tokenless label (never stores the raw token)', () => {
      const tokens = [
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', // crypto.randomBytes(20).hex shape
        'deadBEEF0123456789',
        'tok.en-with_odd.chars',
      ]
      for (const token of tokens) {
        const out = normalizePath(`/reset-password/${token}`)
        expect(out).toBe('/reset-password/[token]')
        expect(out).not.toContain(token) // the raw single-use credential never survives
      }
      // Full URL form + trailing segments/query still collapse.
      expect(normalizePath('https://demo.example.com/reset-password/SECRETTOKEN?x=1')).toBe(
        '/reset-password/[token]',
      )
      expect(normalizePath('/reset-password/SECRETTOKEN/extra')).toBe('/reset-password/[token]')
      // A bare /reset-password (no token) is left as-is.
      expect(normalizePath('/reset-password')).toBe('/reset-password')
    })

    it('D8 — collapses a protocol-relative leading `//` or `/\\` so it can never be an open redirect', () => {
      // A leading `//` (or `/\`, which browsers normalize to `//`) would resolve
      // to a protocol-relative `//evil.com` when handed to redirect().
      for (const evil of ['//evil.com', '//evil.com/path', '/\\evil.com', '/\\/evil.com', '///a']) {
        const out = normalizePath(evil)
        expect(out.startsWith('//')).toBe(false)
        expect(out.startsWith('/\\')).toBe(false)
        expect(out.startsWith('/')).toBe(true)
        // Resolving against a real origin must NOT escape it (same-origin path).
        expect(new URL(out, 'https://safe.invalid').origin).toBe('https://safe.invalid')
      }
      expect(normalizePath('//evil.com')).toBe('/evil.com')
      expect(normalizePath('/\\evil')).toBe('/evil')
    })
  })

  describe('menuNumberFromPath', () => {
    it('extracts the menu number from a /page/{n} path', () => {
      expect(menuNumberFromPath('/page/12')).toBe(12)
      expect(menuNumberFromPath('/page/7/')).toBe(7)
    })

    it('returns null for other paths', () => {
      expect(menuNumberFromPath('/board/B1')).toBeNull()
      expect(menuNumberFromPath('/')).toBeNull()
      expect(menuNumberFromPath('/page/abc')).toBeNull()
      expect(menuNumberFromPath('/page/-3')).toBeNull()
    })
  })
})
