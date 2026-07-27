import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { hasMenuAccess } from '@/access/hasMenuAccess'
import { activePasswordPolicyText } from '@/collections/PasswordPolicies'
import {
  loadPasswordPolicyHistory,
  PASSWORD_POLICY_MENU_KEY,
  resolveActivePasswordPolicy,
} from '@/privacy/passwordPolicyData'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'

/**
 * Task 6C Part 1 (ref 3-9) — password-policy management surfacing. Boots real
 * Payload against Postgres.
 */
let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`
}
function fakeReq(user: unknown): PayloadRequest {
  return { payload, user, context: {}, headers: new Headers() } as unknown as PayloadRequest
}

async function menuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id as number
}

/** Deactivate every existing policy so each test starts from a known baseline. */
async function deactivateAll(): Promise<void> {
  const all = await payload.find({
    collection: 'passwordPolicies',
    pagination: false,
    limit: 0,
    overrideAccess: true,
  })
  for (const p of all.docs) {
    if (p.isActive) {
      await payload.update({
        collection: 'passwordPolicies',
        id: p.id,
        data: { isActive: false },
        overrideAccess: true,
      })
    }
  }
}

describe('Task 6C — password-policy management surfacing', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await adminMenusStep.run(payload)
    await rolesStep.run(payload)
    await superAdminStep.run(payload)
  })

  it('surfaces the most-recently-created active version as the live policy', async () => {
    await deactivateAll()
    const v1 = await payload.create({
      collection: 'passwordPolicies',
      data: { ruleText: unique('rule-v1 '), isActive: true },
      overrideAccess: true,
    })
    const v2 = await payload.create({
      collection: 'passwordPolicies',
      data: { ruleText: unique('rule-v2 '), isActive: true },
      overrideAccess: true,
    })

    const history = await loadPasswordPolicyHistory(payload)
    expect(history.active?.id).toBe(v2.id)
    // v2 row flagged LIVE; v1 row active-but-superseded.
    const rowV2 = history.rows.find((r) => r.id === v2.id)
    const rowV1 = history.rows.find((r) => r.id === v1.id)
    expect(rowV2?.isCurrentActive).toBe(true)
    expect(rowV1?.isActive).toBe(true)
    expect(rowV1?.isCurrentActive).toBe(false)

    // The displayed guidance (the notice source) reflects the same live policy.
    expect(await activePasswordPolicyText(payload)).toBe(v2.ruleText)
  })

  it('falls back to the prior active version when the newest is deactivated', async () => {
    await deactivateAll()
    const v1 = await payload.create({
      collection: 'passwordPolicies',
      data: { ruleText: unique('older '), isActive: true },
      overrideAccess: true,
    })
    const v2 = await payload.create({
      collection: 'passwordPolicies',
      data: { ruleText: unique('newer '), isActive: true },
      overrideAccess: true,
    })
    expect((await loadPasswordPolicyHistory(payload)).active?.id).toBe(v2.id)

    await payload.update({
      collection: 'passwordPolicies',
      id: v2.id,
      data: { isActive: false },
      overrideAccess: true,
    })

    const after = await loadPasswordPolicyHistory(payload)
    expect(after.active?.id).toBe(v1.id)
    expect(await activePasswordPolicyText(payload)).toBe(v1.ruleText)
  })

  it('stamps createdBy from the acting user and keeps it immutable across edits', async () => {
    const role = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_PP_${unique('R').toUpperCase()}`,
        name: 'pp role',
        description: 'x',
        menuGrants: [await menuId(PASSWORD_POLICY_MENU_KEY)],
      },
      overrideAccess: true,
    })
    const actor = await payload.create({
      collection: 'users',
      data: {
        email: `${unique('pp')}@example.com`.toLowerCase(),
        password: TEST_PASSWORD,
        name: 'Policy Author',
        loginId: unique('author').toLowerCase(),
        roles: [role.id],
        status: 'active',
      } as never,
      overrideAccess: true,
    })

    const created = await payload.create({
      collection: 'passwordPolicies',
      // Client tries to spoof createdBy — the hook must overwrite it.
      data: { ruleText: unique('authored '), isActive: false, createdBy: 'spoofed' } as never,
      overrideAccess: true,
      user: actor,
    })
    expect(created.createdBy).toBe(`Policy Author(${(actor as { loginId: string }).loginId})`)

    // Editing the version must not change the recorded author.
    const edited = await payload.update({
      collection: 'passwordPolicies',
      id: created.id,
      data: { ruleText: unique('edited '), createdBy: 'tamper' } as never,
      overrideAccess: true,
      user: actor,
    })
    expect(edited.createdBy).toBe(created.createdBy)
  })

  it('gates the management view: roleless denied, grant allowed, super allowed', async () => {
    const grantRole = await payload.create({
      collection: 'roles',
      data: {
        roleId: `ROLE_PP_${unique('G').toUpperCase()}`,
        name: 'pp grant',
        description: 'x',
        menuGrants: [await menuId(PASSWORD_POLICY_MENU_KEY)],
      },
      overrideAccess: true,
    })
    const superRole = await payload.find({
      collection: 'roles',
      where: { isSuper: { equals: true } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })

    const roleless = { id: 1, roles: [] }
    const granted = { id: 2, roles: [grantRole] }
    const superUser = { id: 3, roles: [superRole.docs[0]] }

    expect(await hasMenuAccess(fakeReq(roleless), PASSWORD_POLICY_MENU_KEY)).toBe(false)
    expect(await hasMenuAccess(fakeReq(granted), PASSWORD_POLICY_MENU_KEY)).toBe(true)
    expect(await hasMenuAccess(fakeReq(superUser), PASSWORD_POLICY_MENU_KEY)).toBe(true)
  })

  it('resolveActivePasswordPolicy matches the DB-backed loader (consistency)', async () => {
    const history = await loadPasswordPolicyHistory(payload)
    const all = await payload.find({
      collection: 'passwordPolicies',
      pagination: false,
      limit: 0,
      overrideAccess: true,
    })
    const pure = resolveActivePasswordPolicy(all.docs as never)
    expect(history.active?.id ?? null).toBe(pure?.id ?? null)
  })

  /**
   * Task 7A #3 — tie-break parity. On an EXACT `createdAt` tie the pure resolver
   * (`resolveActivePasswordPolicy`) breaks it by HIGHEST id; the DB-backed
   * `activePasswordPolicyText` now carries the same secondary `-id` sort. Both
   * must therefore pick the SAME policy so the LIVE badge and the displayed
   * notice never disagree. Fails WITHOUT the secondary sort (Postgres could
   * return either row first on a `-createdAt`-only order).
   */
  it('breaks a createdAt tie identically in both the pure resolver and the DB query', async () => {
    await deactivateAll()
    const sharedCreatedAt = new Date('2026-03-03T03:03:03.003Z').toISOString()
    const a = await payload.create({
      collection: 'passwordPolicies',
      data: { ruleText: unique('tie-A '), isActive: true, createdAt: sharedCreatedAt } as never,
      overrideAccess: true,
    })
    const b = await payload.create({
      collection: 'passwordPolicies',
      data: { ruleText: unique('tie-B '), isActive: true, createdAt: sharedCreatedAt } as never,
      overrideAccess: true,
    })
    // Same millisecond createdAt on both; the higher-id row must win in BOTH.
    const higherIdRuleText = Number(a.id) > Number(b.id) ? a.ruleText : b.ruleText

    const dbText = await activePasswordPolicyText(payload)
    expect(dbText).toBe(higherIdRuleText)

    const all = await payload.find({
      collection: 'passwordPolicies',
      where: { isActive: { equals: true } },
      pagination: false,
      limit: 0,
      overrideAccess: true,
    })
    const pure = resolveActivePasswordPolicy(all.docs as never)
    expect(pure?.ruleText).toBe(higherIdRuleText)
    // And they agree with each other (the actual invariant).
    expect(dbText).toBe(pure?.ruleText)
  })
})
