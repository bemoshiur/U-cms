import { beforeEach, describe, expect, it } from 'vitest'

import {
  __resetAdminMenuKeyCacheForTests,
  __setAdminMenuKeyCacheForTests,
  hasMenuAccessSync,
} from '@/access/hasMenuAccess'

/**
 * Unit tests for the pure, DB-free grant-resolution logic — exercises the
 * exact `hasMenuAccessSync` function `admin.hidden` calls in production
 * (see the design-decision comment at the top of
 * `src/access/hasMenuAccess.ts`), seeding its module-level menuKey cache
 * directly via the test-only setter rather than booting Payload.
 */
describe('hasMenuAccessSync (pure grant-resolution logic)', () => {
  beforeEach(() => {
    __resetAdminMenuKeyCacheForTests()
    __setAdminMenuKeyCacheForTests('system.sites', 42)
  })

  it('denies when there is no user', () => {
    expect(hasMenuAccessSync(null, 'system.sites')).toBe(false)
    expect(hasMenuAccessSync(undefined, 'system.sites')).toBe(false)
  })

  it('denies a roleless user', () => {
    const user = { id: 1, email: 'roleless@example.com', roles: [] }
    expect(hasMenuAccessSync(user, 'system.sites')).toBe(false)
  })

  it('denies a user whose held role does not grant the menu (ungranted)', () => {
    const user = {
      id: 1,
      email: 'ungranted@example.com',
      roles: [{ id: 9, isSuper: false, menuGrants: [7] }], // 7 !== the cached 42
    }
    expect(hasMenuAccessSync(user, 'system.sites')).toBe(false)
  })

  it('grants a user whose held role includes the target menu id (menuGrants as bare ids)', () => {
    const user = {
      id: 1,
      email: 'granted@example.com',
      roles: [{ id: 9, isSuper: false, menuGrants: [42] }],
    }
    expect(hasMenuAccessSync(user, 'system.sites')).toBe(true)
  })

  it('grants a user whose held role includes the target menu as a populated object', () => {
    const user = {
      id: 1,
      email: 'granted-populated@example.com',
      roles: [{ id: 9, isSuper: false, menuGrants: [{ id: 42, menuKey: 'system.sites' }] }],
    }
    expect(hasMenuAccessSync(user, 'system.sites')).toBe(true)
  })

  it('grants unconditionally when any held role has isSuper, regardless of menuGrants', () => {
    const user = {
      id: 1,
      email: 'super@example.com',
      roles: [
        { id: 9, isSuper: false, menuGrants: [] },
        { id: 10, isSuper: true, menuGrants: [] },
      ],
    }
    expect(hasMenuAccessSync(user, 'system.sites')).toBe(true)
    // isSuper bypasses the cache lookup entirely — still true even for a
    // menuKey that was never seeded into the cache (lockout-safety case).
    expect(hasMenuAccessSync(user, 'never.seeded.menu.key')).toBe(true)
  })

  it('denies when the menuKey has never been resolved into the cache (cold cache, non-super)', () => {
    const user = {
      id: 1,
      email: 'cold-cache@example.com',
      roles: [{ id: 9, isSuper: false, menuGrants: [42] }],
    }
    expect(hasMenuAccessSync(user, 'never.seeded.menu.key')).toBe(false)
  })

  it('safely skips unresolved (bare-id) role entries rather than throwing', () => {
    // A role that hasn't been populated into a full doc (just a raw ID) —
    // hasMenuAccessSync only trusts already-populated roles; this must not
    // crash, and must not grant access based on data it can't see.
    const user = { id: 1, email: 'shallow@example.com', roles: [9] }
    expect(hasMenuAccessSync(user, 'system.sites')).toBe(false)
  })
})
