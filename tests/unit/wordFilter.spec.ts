import { describe, expect, it } from 'vitest'

import {
  checkBannedWord,
  containsAnyWord,
  containsProfanity,
  extractLexicalText,
} from '@/content/wordFilter'

describe('wordFilter (Task 3B Part 4)', () => {
  describe('containsAnyWord', () => {
    it('matches case-insensitive substrings', () => {
      expect(containsAnyWord('Hello WORLD', ['world'])).toBe(true)
      expect(containsAnyWord('hello', ['world'])).toBe(false)
    })
    it('ignores blank/whitespace-only filter words (would match everything)', () => {
      expect(containsAnyWord('anything', ['', '   '])).toBe(false)
    })
    it('returns false for empty text', () => {
      expect(containsAnyWord('', ['word'])).toBe(false)
    })
  })

  describe('containsProfanity', () => {
    const words = [
      { word: 'badword', isActive: true },
      { word: 'inactiveword', isActive: false },
    ]
    it('flags an active word (substring, case-insensitive)', () => {
      expect(containsProfanity('this is a BADWORD here', words)).toBe(true)
    })
    it('ignores an inactive word', () => {
      expect(containsProfanity('this contains inactiveword', words)).toBe(false)
    })
    it('returns only a boolean (never echoes the matched word)', () => {
      const result = containsProfanity('badword', words)
      expect(typeof result).toBe('boolean')
    })
    it('is clean text safe', () => {
      expect(containsProfanity('perfectly fine text', words)).toBe(false)
    })
  })

  describe('checkBannedWord (scope semantics)', () => {
    const words = [
      { word: 'admin', scope: 'loginId' as const, isActive: true },
      { word: 'secret', scope: 'password' as const, isActive: true },
      { word: 'forbidden', scope: 'common' as const, isActive: true },
      { word: 'olddisabled', scope: 'common' as const, isActive: false },
    ]

    it('a loginId-scoped word applies to loginId checks but NOT password checks', () => {
      expect(checkBannedWord('superadmin', 'loginId', words)).toBe(true)
      expect(checkBannedWord('superadmin', 'password', words)).toBe(false)
    })
    it('a password-scoped word applies to password checks but NOT loginId checks', () => {
      expect(checkBannedWord('mysecret1', 'password', words)).toBe(true)
      expect(checkBannedWord('mysecret1', 'loginId', words)).toBe(false)
    })
    it('a common-scoped word applies to every scope', () => {
      expect(checkBannedWord('forbiddenname', 'loginId', words)).toBe(true)
      expect(checkBannedWord('forbiddenname', 'password', words)).toBe(true)
    })
    it('ignores inactive words regardless of scope', () => {
      expect(checkBannedWord('olddisabled', 'loginId', words)).toBe(false)
    })
    it('passes a clean value', () => {
      expect(checkBannedWord('cleanvalue', 'loginId', words)).toBe(false)
    })
  })

  describe('extractLexicalText', () => {
    it('collects text from a nested Lexical editor state', () => {
      const value = {
        root: {
          children: [
            { type: 'paragraph', children: [{ type: 'text', text: 'hello' }] },
            { type: 'paragraph', children: [{ type: 'text', text: 'world' }] },
          ],
        },
      }
      expect(extractLexicalText(value)).toContain('hello')
      expect(extractLexicalText(value)).toContain('world')
    })
    it('tolerates null / malformed input', () => {
      expect(extractLexicalText(null)).toBe('')
      expect(extractLexicalText(undefined)).toBe('')
      expect(extractLexicalText('not an object')).toBe('')
    })
  })
})
