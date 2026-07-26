import { describe, expect, it } from 'vitest'

import { resolveActivePasswordPolicy, type PasswordPolicyLike } from '@/privacy/passwordPolicyData'

/**
 * Task 6C Part 1 (ref 3-9): the "active = most-recently-created among active"
 * rule, surfaced by the management view. Pure — no DB.
 */
describe('resolveActivePasswordPolicy', () => {
  const at = (n: number) => new Date(2026, 0, n).toISOString()

  it('returns null for an empty list', () => {
    expect(resolveActivePasswordPolicy([])).toBeNull()
  })

  it('returns null when no version is active', () => {
    const policies: PasswordPolicyLike[] = [
      { id: 1, ruleText: 'a', isActive: false, createdAt: at(1) },
      { id: 2, ruleText: 'b', isActive: false, createdAt: at(2) },
    ]
    expect(resolveActivePasswordPolicy(policies)).toBeNull()
  })

  it('picks the single active version', () => {
    const policies: PasswordPolicyLike[] = [
      { id: 1, ruleText: 'a', isActive: false, createdAt: at(1) },
      { id: 2, ruleText: 'live', isActive: true, createdAt: at(2) },
    ]
    expect(resolveActivePasswordPolicy(policies)?.id).toBe(2)
  })

  it('picks the MOST RECENTLY CREATED among several active versions', () => {
    const policies: PasswordPolicyLike[] = [
      { id: 1, ruleText: 'old-active', isActive: true, createdAt: at(1) },
      { id: 2, ruleText: 'new-active', isActive: true, createdAt: at(5) },
      { id: 3, ruleText: 'mid-active', isActive: true, createdAt: at(3) },
    ]
    const active = resolveActivePasswordPolicy(policies)
    expect(active?.id).toBe(2)
    expect(active?.ruleText).toBe('new-active')
  })

  it('falls back to a prior active version once the newest is deactivated', () => {
    // Reproduces the "deactivate → prior active becomes current" transition.
    const before: PasswordPolicyLike[] = [
      { id: 1, ruleText: 'v1', isActive: true, createdAt: at(1) },
      { id: 2, ruleText: 'v2', isActive: true, createdAt: at(2) },
    ]
    expect(resolveActivePasswordPolicy(before)?.id).toBe(2)

    const after = before.map((p) => (p.id === 2 ? { ...p, isActive: false } : p))
    expect(resolveActivePasswordPolicy(after)?.id).toBe(1)
  })

  it('breaks a createdAt tie deterministically by higher id (later insert)', () => {
    const policies: PasswordPolicyLike[] = [
      { id: 10, ruleText: 'a', isActive: true, createdAt: at(4) },
      { id: 11, ruleText: 'b', isActive: true, createdAt: at(4) },
    ]
    expect(resolveActivePasswordPolicy(policies)?.id).toBe(11)
  })

  it('ignores inactive versions even when they are the newest', () => {
    const policies: PasswordPolicyLike[] = [
      { id: 1, ruleText: 'active-old', isActive: true, createdAt: at(1) },
      { id: 2, ruleText: 'inactive-new', isActive: false, createdAt: at(9) },
    ]
    expect(resolveActivePasswordPolicy(policies)?.id).toBe(1)
  })
})
