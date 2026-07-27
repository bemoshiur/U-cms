import { describe, expect, it } from 'vitest'

import {
  RICH_ADMIN_ACCOUNTS,
  RICH_MEMBER_COUNT,
  RICH_MEMBER_NAMES,
  RICH_ROLES,
  daysAgoISO,
  lexical,
} from '@/seed/steps/rich/shared'

/**
 * Fast, DB-free guards on the RICH DEMO SEED's source-of-truth constants — the
 * shape the seed relies on (unique login IDs / emails, valid role IDs, enough
 * member names) so a bad edit is caught without booting Payload.
 */
describe('rich seed — admin accounts', () => {
  const loginIdFormat = /^[a-z0-9][a-z0-9._-]{3,}$/

  it('has four accounts with unique login IDs + emails', () => {
    expect(RICH_ADMIN_ACCOUNTS).toHaveLength(4)
    const loginIds = RICH_ADMIN_ACCOUNTS.map((a) => a.loginId)
    const emails = RICH_ADMIN_ACCOUNTS.map((a) => a.email)
    expect(new Set(loginIds).size).toBe(loginIds.length)
    expect(new Set(emails).size).toBe(emails.length)
  })

  it('login IDs match the users.loginId format and roles are ROLE_*', () => {
    for (const a of RICH_ADMIN_ACCOUNTS) {
      expect(a.loginId, a.loginId).toMatch(loginIdFormat)
      expect(a.roleId).toMatch(/^ROLE_[A-Z0-9_]+$/)
      expect(a.email).toContain('@')
      expect(a.name.length).toBeGreaterThan(0)
    }
  })
})

describe('rich seed — roles', () => {
  it('defines two non-super roles with grants', () => {
    expect(RICH_ROLES).toHaveLength(2)
    for (const r of RICH_ROLES) {
      expect(r.roleId).toMatch(/^ROLE_[A-Z0-9_]+$/)
      expect(r.menuKeys.length).toBeGreaterThan(0)
      expect(r.name.length).toBeGreaterThan(0)
      expect(r.description.length).toBeGreaterThan(0)
    }
  })

  it('every admin account references a role that is either seeded here or a known base role', () => {
    const known = new Set([...RICH_ROLES.map((r) => r.roleId), 'ROLE_PRIVACY_OFFICER'])
    for (const a of RICH_ADMIN_ACCOUNTS) {
      expect(known.has(a.roleId), a.roleId).toBe(true)
    }
  })
})

describe('rich seed — members + helpers', () => {
  it('has enough distinct member names for the roster', () => {
    expect(RICH_MEMBER_COUNT).toBeGreaterThanOrEqual(15)
    expect(RICH_MEMBER_NAMES.length).toBeGreaterThanOrEqual(RICH_MEMBER_COUNT)
    expect(new Set(RICH_MEMBER_NAMES).size).toBe(RICH_MEMBER_NAMES.length)
  })

  it('lexical() builds a valid single-root editor state', () => {
    const doc = lexical('Hello', 'World')
    expect(doc.root.type).toBe('root')
    expect(doc.root.children).toHaveLength(2)
    expect(doc.root.children[0]?.children[0]?.text).toBe('Hello')
  })

  it('daysAgoISO() returns an ISO timestamp in the past', () => {
    const iso = daysAgoISO(30)
    expect(new Date(iso).getTime()).toBeLessThan(Date.now())
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
