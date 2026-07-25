import { describe, expect, it } from 'vitest'

import { validateMemberPassword } from '@/auth/validateMemberPassword'

/**
 * Member password policy (Task 4B) — the deliberately LIGHTER counterpart to the
 * admin `validatePassword`: min length 8, ≥2 character classes, must not contain
 * the login ID. No keyboard-walk/sequence blocklist (that's admin-only).
 */
describe('validateMemberPassword', () => {
  it('rejects empty / non-string', () => {
    expect(validateMemberPassword('')).not.toBe(true)
    expect(validateMemberPassword(undefined)).not.toBe(true)
    expect(validateMemberPassword(12345678 as unknown)).not.toBe(true)
  })

  it('rejects a too-short password', () => {
    expect(validateMemberPassword('Ab1!')).toMatch(/at least 8/i)
  })

  it('rejects a single-class password even when long enough', () => {
    expect(validateMemberPassword('aaaaaaaaaa')).toMatch(/at least two/i)
    expect(validateMemberPassword('12345678')).toMatch(/at least two/i)
  })

  it('rejects a password containing the login ID', () => {
    expect(validateMemberPassword('johnsmith99', { loginId: 'johnsmith' })).toMatch(/login id/i)
  })

  it('accepts a valid two-class password', () => {
    expect(validateMemberPassword('welcome12')).toBe(true)
  })

  it('accepts a valid three-class password not containing the login ID', () => {
    expect(validateMemberPassword('Pulse-Member-2026', { loginId: 'demo-member' })).toBe(true)
  })

  it('is lighter than admin policy: allows a sequence a member could pick', () => {
    // "abcd1234" is 8 chars, 2 classes — the admin policy rejects it as a
    // sequence, the member policy intentionally allows it.
    expect(validateMemberPassword('abcd1234')).toBe(true)
  })
})
