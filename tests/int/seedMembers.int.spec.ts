import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { sitesStep } from '@/seed/steps/sites'
import { membersStep, SEED_MEMBERS } from '@/seed/steps/members'

/**
 * D1 hardening — the `members` seed step must refuse the built-in default,
 * source-visible demo-member password in production (this repo is public, so the
 * default is a known credential the moment SEED_ON_DEPLOY runs). Mirrors the
 * super-admin production-refusal tests. Runs the REAL step end-to-end; env is
 * stubbed per-case and restored after. The demo members are cleared before each
 * case so the CREATE path (not the idempotent skip) is exercised.
 */

let payload: Payload
let demoId: number | string

const DEMO_LOGIN_IDS = SEED_MEMBERS.map((m) => m.loginId)

async function demoMemberCount(): Promise<number> {
  const found = await payload.find({
    collection: 'members',
    where: {
      and: [{ tenant: { equals: demoId } }, { loginId: { in: DEMO_LOGIN_IDS } }],
    },
    pagination: false,
    overrideAccess: true,
  })
  return found.docs.length
}

async function deleteDemoMembers(): Promise<void> {
  await payload.delete({
    collection: 'members',
    where: {
      and: [{ tenant: { equals: demoId } }, { loginId: { in: DEMO_LOGIN_IDS } }],
    },
    overrideAccess: true,
  })
}

describe('seed: members — production default-password refusal (D1)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, sitesStep])
    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    demoId = demo.docs[0]!.id
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('PROD + SEED_MEMBER_PASSWORD unset → REFUSES to create the demo member (no member created)', async () => {
    await deleteDemoMembers()
    expect(await demoMemberCount()).toBe(0)

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SEED_MEMBER_PASSWORD', '')

    await expect(runSeed(payload, [membersStep])).rejects.toThrow(
      /SEED_MEMBER_PASSWORD is required when seeding a member in production/,
    )

    // Proves the refusal actually prevented member creation (fail-without-fix:
    // the login-capable demo member would exist with the known default password).
    expect(await demoMemberCount()).toBe(0)
  })

  it('PROD + SEED_MEMBER_PASSWORD set → seeds the demo members normally', async () => {
    await deleteDemoMembers()

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('SEED_MEMBER_PASSWORD', 'a-strong-prod-member-secret-123')

    await expect(runSeed(payload, [membersStep])).resolves.toBeUndefined()
    expect(await demoMemberCount()).toBe(SEED_MEMBERS.length)
  })

  it('DEV + default password → still seeds the demo members (dev behavior unchanged)', async () => {
    await deleteDemoMembers()
    // NODE_ENV=test (the vitest default) — not production. SEED_MEMBER_PASSWORD
    // deliberately unset → the dev-only default is used.
    await expect(runSeed(payload, [membersStep])).resolves.toBeUndefined()
    expect(await demoMemberCount()).toBe(SEED_MEMBERS.length)
  })
})
