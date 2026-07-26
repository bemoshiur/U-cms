import { describe, expect, it } from 'vitest'

import { assertSeedAdminPasswordSafeForProduction } from '@/seed/steps/superAdmin'

/**
 * Task TR2 hardening — never seed the KNOWN default super-admin password to a
 * public (production) deployment. Pure logic; no Payload, no DB.
 */

type Env = NodeJS.ProcessEnv
const env = (overrides: Record<string, string | undefined> = {}): Env => ({ ...overrides }) as Env

describe('assertSeedAdminPasswordSafeForProduction', () => {
  it('THROWS in production when SEED_ADMIN_PASSWORD is unset (default would be used)', () => {
    expect(() => assertSeedAdminPasswordSafeForProduction(env({ NODE_ENV: 'production' }))).toThrow(
      /SEED_ADMIN_PASSWORD is required when seeding in production/,
    )
  })

  it('does NOT throw in production when SEED_ADMIN_PASSWORD is set', () => {
    expect(() =>
      assertSeedAdminPasswordSafeForProduction(
        env({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: 'a-strong-prod-secret-123' }),
      ),
    ).not.toThrow()
  })

  it('THROWS in production when SEED_ADMIN_PASSWORD is empty (empty is treated as unset)', () => {
    // An empty string is falsy → still refused (the default would be used).
    expect(() =>
      assertSeedAdminPasswordSafeForProduction(
        env({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: '' }),
      ),
    ).toThrow(/SEED_ADMIN_PASSWORD is required/)
  })

  it('does NOT throw in dev/test with the default (dev behavior unchanged)', () => {
    expect(() =>
      assertSeedAdminPasswordSafeForProduction(env({ NODE_ENV: 'development' })),
    ).not.toThrow()
    expect(() => assertSeedAdminPasswordSafeForProduction(env({ NODE_ENV: 'test' }))).not.toThrow()
    expect(() => assertSeedAdminPasswordSafeForProduction(env({}))).not.toThrow()
  })
})
