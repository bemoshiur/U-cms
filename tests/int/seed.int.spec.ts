import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
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
