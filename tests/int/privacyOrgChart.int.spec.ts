import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { hasMenuAccess } from '@/access/hasMenuAccess'
import {
  loadPrivacyOrgChart,
  PRIVACY_ORG_MENU_KEY,
  PRIVACY_ROLE_DEPUTY,
  PRIVACY_ROLE_OFFICER,
  PRIVACY_ROLE_STAFF,
} from '@/privacy/orgChart'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { departmentsStep } from '@/seed/steps/departments'
import { privacyRolesStep } from '@/seed/steps/privacyRoles'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'

/**
 * Task 6C Part 2 (ref 3-10) — the auto-generated privacy org chart. Boots real
 * Payload against Postgres and exercises the seed + the DB-backed derivation.
 */
let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`
}
function fakeReq(user: unknown): PayloadRequest {
  return { payload, user, context: {}, headers: new Headers() } as unknown as PayloadRequest
}

async function roleDbId(roleId: string): Promise<number> {
  const found = await payload.find({
    collection: 'roles',
    where: { roleId: { equals: roleId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]?.id as number
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

describe('Task 6C — privacy organization chart', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await adminMenusStep.run(payload)
    await rolesStep.run(payload)
    await superAdminStep.run(payload)
    await departmentsStep.run(payload)
    await privacyRolesStep.run(payload)
  })

  it('seeds the four privacy roles, each granting privacy.orgChart', async () => {
    const orgMenu = await menuId(PRIVACY_ORG_MENU_KEY)
    for (const roleId of [PRIVACY_ROLE_OFFICER, PRIVACY_ROLE_DEPUTY, PRIVACY_ROLE_STAFF]) {
      const found = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: roleId } },
        limit: 1,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      const role = found.docs[0]
      expect(role, `role ${roleId} seeded`).toBeTruthy()
      const grants = (role?.menuGrants ?? []).map((g) => (typeof g === 'object' ? g.id : g))
      expect(grants).toContain(orgMenu)
      expect(role?.isSuper).toBeFalsy()
    }
  })

  it('renders a non-empty chart from the seeded assignments (officer + example tiers)', async () => {
    const tiers = await loadPrivacyOrgChart(payload)
    expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4])
    // The super-admin holds OFFICER; example admins fill deputy/team/staff.
    expect(tiers[0].members.length).toBeGreaterThan(0) // officer
    expect(tiers[1].members.length).toBeGreaterThan(0) // deputy (example)
    expect(tiers[3].members.length).toBeGreaterThan(0) // staff (two examples)
    // Staff carry a duty label (own or the administrative-safeguards default).
    expect(tiers[3].members.every((m) => m.duty.length > 0)).toBe(true)
  })

  /**
   * Task 7A D1 — the four seeded EXAMPLE privacy-org admins must be `pending`,
   * not `active`. They now hold real §3 privacy-menu grants (Task 6D), so an
   * inert-but-active demo account is no longer acceptable: `pending` blocks
   * authentication (defense-in-depth beyond the unrecoverable random password).
   * The chart still renders them (it derives from role assignment, not status).
   */
  it('seeds the example privacy-org admins as pending (D1)', async () => {
    const examples = await payload.find({
      collection: 'users',
      where: {
        loginId: { in: ['privacy-deputy', 'privacy-team', 'privacy-staff-1', 'privacy-staff-2'] },
      },
      pagination: false,
      overrideAccess: true,
    })
    expect(examples.docs.length).toBe(4)
    for (const admin of examples.docs) {
      expect(admin.status, `${admin.loginId} must be pending`).toBe('pending')
    }
  })

  it('RE-DERIVES as role assignments change (staff → deputy moves tiers)', async () => {
    const staffRole = await roleDbId(PRIVACY_ROLE_STAFF)
    const deputyRole = await roleDbId(PRIVACY_ROLE_DEPUTY)
    const admin = await payload.create({
      collection: 'users',
      data: {
        email: `${unique('oc')}@example.com`.toLowerCase(),
        password: TEST_PASSWORD,
        name: 'Chart Mover',
        loginId: unique('mover').toLowerCase(),
        roles: [staffRole],
        status: 'active',
        duties: 'test duty',
      } as never,
      overrideAccess: true,
    })

    const before = await loadPrivacyOrgChart(payload)
    expect(before[3].members.some((m) => m.id === admin.id)).toBe(true) // in staff
    expect(before[1].members.some((m) => m.id === admin.id)).toBe(false) // not deputy

    await payload.update({
      collection: 'users',
      id: admin.id,
      data: { roles: [deputyRole] },
      overrideAccess: true,
    })

    const after = await loadPrivacyOrgChart(payload)
    expect(after[1].members.some((m) => m.id === admin.id)).toBe(true) // now deputy
    expect(after[3].members.some((m) => m.id === admin.id)).toBe(false) // no longer staff
  })

  it('gates the org-chart view: roleless denied, privacy grantee allowed, super allowed', async () => {
    const officerRole = await payload.find({
      collection: 'roles',
      where: { roleId: { equals: PRIVACY_ROLE_OFFICER } },
      limit: 1,
      pagination: false,
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
    const privacyGrantee = { id: 2, roles: [officerRole.docs[0]] }
    const superUser = { id: 3, roles: [superRole.docs[0]] }

    expect(await hasMenuAccess(fakeReq(roleless), PRIVACY_ORG_MENU_KEY)).toBe(false)
    expect(await hasMenuAccess(fakeReq(privacyGrantee), PRIVACY_ORG_MENU_KEY)).toBe(true)
    expect(await hasMenuAccess(fakeReq(superUser), PRIVACY_ORG_MENU_KEY)).toBe(true)
  })
})
