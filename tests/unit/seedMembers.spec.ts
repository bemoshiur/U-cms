import { describe, expect, it } from 'vitest'

import { assertSeedMemberPasswordSafeForProduction } from '@/seed/steps/members'

/**
 * D1 hardening — never seed the KNOWN default, source-visible member password to
 * a public (production) deployment. This repo is public, so a login-capable demo
 * member with a hard-coded password is a known credential the moment
 * SEED_ON_DEPLOY runs. Pure logic; no Payload, no DB. Mirrors the super-admin
 * guard (`assertSeedAdminPasswordSafeForProduction`), which did not cover members.
 */

type Env = NodeJS.ProcessEnv
const env = (overrides: Record<string, string | undefined> = {}): Env => ({ ...overrides }) as Env

describe('assertSeedMemberPasswordSafeForProduction', () => {
  it('THROWS in production when SEED_MEMBER_PASSWORD is unset (default would be used)', () => {
    expect(() =>
      assertSeedMemberPasswordSafeForProduction(env({ NODE_ENV: 'production' })),
    ).toThrow(/SEED_MEMBER_PASSWORD is required when seeding a member in production/)
  })

  it('does NOT throw in production when SEED_MEMBER_PASSWORD is set', () => {
    expect(() =>
      assertSeedMemberPasswordSafeForProduction(
        env({ NODE_ENV: 'production', SEED_MEMBER_PASSWORD: 'a-strong-prod-member-secret-123' }),
      ),
    ).not.toThrow()
  })

  it('THROWS in production when SEED_MEMBER_PASSWORD is empty (empty is treated as unset)', () => {
    expect(() =>
      assertSeedMemberPasswordSafeForProduction(
        env({ NODE_ENV: 'production', SEED_MEMBER_PASSWORD: '' }),
      ),
    ).toThrow(/SEED_MEMBER_PASSWORD is required/)
  })

  it('does NOT throw in dev/test with the default (dev behavior unchanged)', () => {
    expect(() =>
      assertSeedMemberPasswordSafeForProduction(env({ NODE_ENV: 'development' })),
    ).not.toThrow()
    expect(() => assertSeedMemberPasswordSafeForProduction(env({ NODE_ENV: 'test' }))).not.toThrow()
    expect(() => assertSeedMemberPasswordSafeForProduction(env({}))).not.toThrow()
  })
})
