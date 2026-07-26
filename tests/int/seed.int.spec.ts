import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import {
  DEFAULT_SEED_ADMIN_EMAIL,
  DEFAULT_SEED_ADMIN_PASSWORD,
  superAdminStep,
} from '@/seed/steps/superAdmin'

let payload: Payload

describe('seed: super-admin', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('creates the super-admin user idempotently and allows login with the seeded credentials', async () => {
    const email = process.env.SEED_ADMIN_EMAIL || DEFAULT_SEED_ADMIN_EMAIL
    const password = process.env.SEED_ADMIN_PASSWORD || DEFAULT_SEED_ADMIN_PASSWORD

    // Run the step twice — the second run must find the existing user and
    // skip creation rather than erroring (e.g. on a unique-email conflict).
    await runSeed(payload, [superAdminStep])
    await runSeed(payload, [superAdminStep])

    const found = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })

    expect(found.docs).toHaveLength(1)
    expect(found.docs[0]?.email).toBe(email)

    const loginResult = await payload.login({
      collection: 'users',
      data: { email, password },
    })

    expect(loginResult.user).toBeDefined()
    expect(loginResult.user?.email).toBe(email)
    expect(loginResult.token).toBeTruthy()
  })
})

/**
 * Task TR2 hardening — the super-admin CREATE path refuses the built-in default
 * password in production (so a public demo can never be seeded with a known
 * credential). Exercises the real step end-to-end; each case uses a UNIQUE email
 * so it hits the create branch (not the heal/skip branch), and `NODE_ENV` /
 * `SEED_ADMIN_*` are stubbed per-case and restored after.
 */
describe('seed: super-admin — production default-password refusal', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    // Ensure ROLE_ADMIN exists (superAdminStep depends on it).
    await runSeed(payload, [adminMenusStep, rolesStep])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function uniqueEmail(): string {
    return `tr2-seed-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`
  }

  it('PROD + SEED_ADMIN_PASSWORD unset → REFUSES to create the super-admin (fail-without-fix)', async () => {
    const email = uniqueEmail()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SEED_ADMIN_EMAIL', email)
    vi.stubEnv('SEED_ADMIN_PASSWORD', '')

    await expect(runSeed(payload, [superAdminStep])).rejects.toThrow(
      /SEED_ADMIN_PASSWORD is required when seeding in production/,
    )

    // Proves the refusal actually prevented account creation.
    const found = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
    expect(found.docs).toHaveLength(0)
  })

  it('PROD + SEED_ADMIN_PASSWORD set → seeds normally', async () => {
    const email = uniqueEmail()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SEED_ADMIN_EMAIL', email)
    vi.stubEnv('SEED_ADMIN_PASSWORD', 'a-strong-prod-secret-123')

    await expect(runSeed(payload, [superAdminStep])).resolves.toBeUndefined()

    const found = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
    expect(found.docs).toHaveLength(1)
  })

  it('DEV + default password → still seeds (dev behavior unchanged)', async () => {
    const email = uniqueEmail()
    // NODE_ENV=test (the vitest default) — not production.
    vi.stubEnv('SEED_ADMIN_EMAIL', email)
    // SEED_ADMIN_PASSWORD deliberately not set → uses the dev default.

    await expect(runSeed(payload, [superAdminStep])).resolves.toBeUndefined()

    const found = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
    expect(found.docs).toHaveLength(1)
    // The seeded account can log in with the dev default password.
    const login = await payload.login({
      collection: 'users',
      data: { email, password: DEFAULT_SEED_ADMIN_PASSWORD },
    })
    expect(login.user?.email).toBe(email)
  })
})
