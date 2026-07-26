import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { resolveMemberWatermark } from '@/members/watermark'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'

/**
 * Task 6B Part 1 — the member-detail watermark data is SERVER-DERIVED and ties to
 * the immutable Task 6A audit row (ref 1-37). Boots real Payload against Postgres.
 */

let payload: Payload
const TEST_PASSWORD = 'a-long-enough-test-password-1'

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 100000)}`
}
function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`.toLowerCase()
}
function uniqueLoginId(label: string): string {
  return `u${label}${Date.now()}${Math.floor(Math.random() * 100000)}`.toLowerCase()
}
function uniqueRoleId(label: string): string {
  return `ROLE_WM_${unique(label).toUpperCase()}`
}

async function menuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`adminMenu "${menuKey}" not found — did the adminMenus seed run?`)
  }
  return id as number
}

async function makeSite(): Promise<number> {
  const site = await payload.create({
    collection: 'sites',
    data: { siteId: uniqueLoginId('site'), name: 'WM Site', url: 'https://wm.example.com' },
    overrideAccess: true,
  })
  return site.id
}

async function makeAdmin(
  menuKeys: string[],
  tenantIds: number[],
): Promise<Record<string, unknown>> {
  const grants = await Promise.all(menuKeys.map(menuId))
  const role = await payload.create({
    collection: 'roles',
    data: { roleId: uniqueRoleId('R'), name: 'wm role', description: 'x', menuGrants: grants },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('admin'),
      password: TEST_PASSWORD,
      name: 'Watermark Admin',
      loginId: uniqueLoginId('admin'),
      roles: [role.id],
      status: 'active',
      tenants: tenantIds.map((t) => ({ tenant: t })),
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function makeMember(siteId: number, label = 'wm'): Promise<Record<string, unknown>> {
  return payload.create({
    collection: 'members',
    data: {
      loginId: uniqueLoginId(label),
      email: uniqueEmail(label),
      name: `Member ${label}`,
      mobile: '01099998888',
      password: 'Member-Pass-99',
      status: 'active',
      tenant: siteId,
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

describe('Task 6B — member-detail watermark (server-derived, tied to the audit row)', () => {
  let siteA: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
    siteA = await makeSite()
  })

  it('derives the mgmt# from the REAL audit-log row written for the audited detail view', async () => {
    const admin = await makeAdmin(['members.manage'], [siteA])
    const member = await makeMember(siteA)

    // The audited single-doc detail read (the T6A full-PII path) — logs a `view`
    // and returns FULL PII (reconfirming T6A is not regressed by Task 6B).
    const detail = await payload.findByID({
      collection: 'members',
      id: member.id as number,
      user: admin,
      overrideAccess: false,
    })
    expect(detail.email).toBe(member.email)
    expect(detail.loginId).toBe(member.loginId)

    // The exact audit row this view produced.
    const logRow = (
      await payload.find({
        collection: 'personalInfoAccessLogs',
        where: {
          and: [
            { subjectMemberId: { equals: String(member.id) } },
            { action: { equals: 'view' } },
            { viewerId: { equals: String(admin.id) } },
          ],
        },
        sort: '-occurredAt',
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]!
    expect(logRow).toBeDefined()

    // The watermark's management number references THAT immutable row.
    const wm = await resolveMemberWatermark(payload, {
      viewer: admin,
      memberId: member.id as number,
    })
    expect(wm.mgmtNo).toBe(`PIA-${logRow.id}`)
    expect(wm.viewerId).toBe(String(admin.id))
    expect(wm.viewerLabel).toBe(`Watermark Admin(${(admin as { loginId: string }).loginId})`)
    // The tile text carries viewer + timestamp + management#.
    expect(wm.text).toContain(wm.viewerLabel)
    expect(wm.text).toContain(wm.timestamp)
    expect(wm.text).toContain(wm.mgmtNo)
  })

  it('falls back to a deterministic composed mgmt# when no view has been logged yet', async () => {
    const admin = await makeAdmin(['members.manage'], [siteA])
    const member = await makeMember(siteA, 'never-viewed')

    // No prior audited detail read → no matching audit row → composed id.
    const wm = await resolveMemberWatermark(payload, {
      viewer: admin,
      memberId: member.id as number,
    })
    expect(wm.mgmtNo).toBe(`PIA-M${member.id}-U${admin.id}-` + wm.mgmtNo.split('-').pop())
    expect(wm.mgmtNo).toMatch(new RegExp(`^PIA-M${member.id}-U${admin.id}-\\d{14}$`))
  })
})
