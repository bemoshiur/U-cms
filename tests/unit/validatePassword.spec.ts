import { describe, expect, it } from 'vitest'

import { SEQUENCE_BLOCKLIST, validatePassword } from '@/auth/validatePassword'

describe('validatePassword (legacy ref 3-9 password composition rules)', () => {
  describe('length + character-class rules', () => {
    it('accepts 10+ chars combining exactly 2 classes (letters + digits)', () => {
      // 12 chars, letters + digits, no sequences, no login-ID.
      expect(validatePassword('mxkpvhq92r7t')).toBe(true)
    })

    it('accepts exactly 8 chars when combining all 3 classes', () => {
      // 8 chars: letters + digit + special, no run of 4, no login-ID.
      expect(validatePassword('mxk9p!vh')).toBe(true)
    })

    it('rejects a 2-class password shorter than 10 chars', () => {
      const result = validatePassword('mxkpvhq9') // 8 chars, 2 classes
      expect(result).not.toBe(true)
      expect(String(result)).toMatch(/at least 10 characters/i)
    })

    it('rejects a 3-class password shorter than 8 chars', () => {
      const result = validatePassword('mx9p!v') // 6 chars, 3 classes
      expect(result).not.toBe(true)
      expect(String(result)).toMatch(/at least 8 characters/i)
    })

    it('rejects a single-class password regardless of length', () => {
      const result = validatePassword('abcdefghijklmnop'.replace(/./g, 'x')) // all 'x'
      expect(result).not.toBe(true)
      expect(String(result)).toMatch(/at least two/i)
    })

    it('rejects empty / non-string input', () => {
      expect(validatePassword('')).not.toBe(true)
      expect(validatePassword(undefined)).not.toBe(true)
      expect(validatePassword(null)).not.toBe(true)
    })
  })

  describe('sequence rejection', () => {
    it('rejects ascending digit runs of 4+ (1234)', () => {
      const result = validatePassword('mxkpvh1234')
      expect(result).not.toBe(true)
      expect(String(result)).toMatch(/sequences/i)
    })

    it('rejects descending digit runs (4321)', () => {
      expect(validatePassword('mxkpvh4321')).not.toBe(true)
    })

    it('rejects ascending letter runs (abcd)', () => {
      expect(validatePassword('9xkpvhabcd')).not.toBe(true)
    })

    it('rejects the keyboard blocklist (qwerty)', () => {
      expect(validatePassword('9xkQWERTYz')).not.toBe(true)
      // Every documented blocklist entry is actually rejected.
      for (const seq of SEQUENCE_BLOCKLIST) {
        expect(validatePassword(`9xZ!${seq}mkpv`)).not.toBe(true)
      }
    })

    it('does NOT reject a 3-long incidental run (abc)', () => {
      // Only runs of >= 4 are treated as sequences.
      expect(validatePassword('mxkpvhabc9')).toBe(true)
    })
  })

  describe('login-ID rejection', () => {
    it('rejects a password that contains the login ID (case-insensitive)', () => {
      const result = validatePassword('myJSMITHpw9', { userId: 'jsmith' })
      expect(result).not.toBe(true)
      expect(String(result)).toMatch(/login id/i)
    })

    it('rejects a password equal to the login ID pattern embedded', () => {
      expect(validatePassword('admin99xkpv', { userId: 'admin' })).not.toBe(true)
    })

    it('accepts when the login ID is absent from the password', () => {
      expect(validatePassword('mxkpvhq92r7t', { userId: 'jsmith' })).toBe(true)
    })

    it('skips the login-ID check for very short IDs (< 3 chars)', () => {
      // A 2-char ID like "ab" appears in too many passwords to be meaningful.
      expect(validatePassword('mxkpvhab92', { userId: 'ab' })).toBe(true)
    })
  })

  it('accepts the seeded super-admin default password', () => {
    // Guards against the seed/default password ever violating the policy.
    expect(validatePassword('changeme-dev-only!', { userId: 'admin' })).toBe(true)
  })
})
