import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { recordPersonalInfoAccess } from '@/audit/recordPersonalInfoAccess'
import { handleMemberExport } from '@/endpoints/memberExport'
import { handlePersonalInfoLogsExport } from '@/endpoints/personalInfoLogsExport'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'

/**
 * Task 6A — personal-info access logging + confirm-gate capture + purpose-gated
 * export (refs 3-8, 1-36). Boots real Payload against Postgres.
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
  return `ROLE_PII_${unique(label).toUpperCase()}`
}

function fakeReq(args: {
  headers?: Record<string, string>
  pathname?: string
  user?: unknown
  data?: Record<string, unknown>
}): PayloadRequest {
  return {
    payload,
    headers: new Headers(args.headers ?? {}),
    pathname: args.pathname,
    user: args.user,
    data: args.data,
    context: {},
  } as unknown as PayloadRequest
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
    data: { siteId: uniqueLoginId('site'), name: 'PII Site', url: 'https://pii.example.com' },
    overrideAccess: true,
  })
  return site.id
}

/** An admin holding the given menu grants, assigned to the given tenants. */
async function makeAdmin(
  menuKeys: string[],
  tenantIds: number[],
): Promise<Record<string, unknown>> {
  const grants = await Promise.all(menuKeys.map(menuId))
  const role = await payload.create({
    collection: 'roles',
    data: { roleId: uniqueRoleId('R'), name: 'pii role', description: 'x', menuGrants: grants },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('admin'),
      password: TEST_PASSWORD,
      name: 'PII Admin',
      loginId: uniqueLoginId('admin'),
      roles: [role.id],
      status: 'active',
      tenants: tenantIds.map((t) => ({ tenant: t })),
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function makeMember(siteId: number, label = 'm'): Promise<Record<string, unknown>> {
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

async function viewLogsFor(memberId: unknown, action: string): Promise<number> {
  const found = await payload.find({
    collection: 'personalInfoAccessLogs',
    where: {
      and: [{ subjectMemberId: { equals: String(memberId) } }, { action: { equals: action } }],
    },
    pagination: false,
    overrideAccess: true,
  })
  return found.docs.length
}

describe('Task 6A — personal-info access logging + purpose-gated export', () => {
  let siteA: number

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
    siteA = await makeSite()
  })

  // ── Part 2 (writer) — recordPersonalInfoAccess ─────────────────────────────
  describe('recordPersonalInfoAccess writer', () => {
    it('captures viewer/subject/screen/url/purpose/ip', async () => {
      const admin = await makeAdmin(['members.manage'], [siteA])
      const member = await makeMember(siteA)
      const url = `/admin/collections/members/${member.id}?${unique('q')}`

      await recordPersonalInfoAccess(payload, {
        req: fakeReq({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, pathname: url }),
        viewer: admin,
        subjectMember: member as never,
        screen: 'member-detail',
        url,
        action: 'view',
        purposeCategory: 'inquiry_response',
        purposeDetail: 'Responding to a phone inquiry',
      })

      const row = (
        await payload.find({
          collection: 'personalInfoAccessLogs',
          where: { url: { equals: url } },
          overrideAccess: true,
        })
      ).docs[0]!
      expect(row).toBeDefined()
      expect(row.action).toBe('view')
      expect(row.screen).toBe('member-detail')
      expect(row.ipAddress).toBe('203.0.113.9')
      expect(row.viewerLabel).toBe(`PII Admin(${(admin as { loginId: string }).loginId})`)
      expect(row.subjectMemberId).toBe(String(member.id))
      expect(row.subjectSiteId).toBe(String(siteA))
      expect(row.purposeCategory).toBe('inquiry_response')
      expect(row.purposeDetail).toBe('Responding to a phone inquiry')
    })

    it('never throws even if the underlying write is impossible', async () => {
      await expect(
        recordPersonalInfoAccess(payload, {
          screen: 's',
          action: 'not-valid' as never,
        }),
      ).resolves.toBeUndefined()
    })
  })

  // ── Part 2 (non-bypassable capture via server hooks) ───────────────────────
  describe('member-detail read/edit is captured by the server hooks (non-bypassable)', () => {
    it('a single-doc by-id read (the raw API read path) logs a `view`', async () => {
      const admin = await makeAdmin(['members.manage'], [siteA])
      const member = await makeMember(siteA)
      expect(await viewLogsFor(member.id, 'view')).toBe(0)

      // The exact local operation a REST `GET /api/members/:id` runs.
      await payload.findByID({
        collection: 'members',
        id: member.id as number,
        user: admin,
        overrideAccess: false,
      })

      expect(await viewLogsFor(member.id, 'view')).toBe(1)
    })

    it('a LIST render does NOT log a view (findMany guard)', async () => {
      const admin = await makeAdmin(['members.manage'], [siteA])
      const member = await makeMember(siteA)
      await payload.find({
        collection: 'members',
        where: { tenant: { equals: siteA } },
        user: admin,
        overrideAccess: false,
        pagination: false,
      })
      expect(await viewLogsFor(member.id, 'view')).toBe(0)
    })

    it('a MEMBER reading their own record does NOT log (self-service, not admin PII access)', async () => {
      const member = await makeMember(siteA)
      const memberPrincipal = { id: member.id, collection: 'members' }
      await payload.findByID({
        collection: 'members',
        id: member.id as number,
        user: memberPrincipal as never,
        overrideAccess: false,
      })
      expect(await viewLogsFor(member.id, 'view')).toBe(0)
    })

    it('an admin EDIT logs `edit` and does NOT double-log a `view`', async () => {
      const admin = await makeAdmin(['members.manage'], [siteA])
      const member = await makeMember(siteA)
      await payload.update({
        collection: 'members',
        id: member.id as number,
        data: { mobile: '01000001111' },
        user: admin,
        overrideAccess: false,
      })
      expect(await viewLogsFor(member.id, 'edit')).toBe(1)
      // The create + the update read-tails must not have logged a spurious view.
      expect(await viewLogsFor(member.id, 'view')).toBe(0)
    })
  })

  // ── Part 1 — immutability + gating ─────────────────────────────────────────
  describe('personalInfoAccessLogs are append-only + immutable + gated', () => {
    it('rejects update even for a super, even under overrideAccess', async () => {
      const member = await makeMember(siteA)
      await recordPersonalInfoAccess(payload, {
        subjectMember: member as never,
        viewer: { id: 1, name: 'x', loginId: 'x' },
        screen: 'member-detail',
        action: 'view',
      })
      const row = (
        await payload.find({ collection: 'personalInfoAccessLogs', limit: 1, overrideAccess: true })
      ).docs[0]!

      const superRole = await payload.create({
        collection: 'roles',
        data: { roleId: uniqueRoleId('SUP'), name: 's', description: 'x', isSuper: true },
        overrideAccess: true,
      })
      const superUser = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('sup'),
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        } as never,
        overrideAccess: true,
      })

      await expect(
        payload.update({
          collection: 'personalInfoAccessLogs',
          id: row.id,
          data: { purposeDetail: '/tampered' },
          user: superUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      await expect(
        payload.update({
          collection: 'personalInfoAccessLogs',
          id: row.id,
          data: { purposeDetail: '/tampered' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('denies a roleless user read; allows a privacy.personalInfoLogs grantee; create denied', async () => {
      const roleless = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('none'),
          password: TEST_PASSWORD,
          roles: [],
          status: 'active',
        } as never,
        overrideAccess: true,
      })
      await expect(
        payload.find({
          collection: 'personalInfoAccessLogs',
          user: roleless,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      const granted = await makeAdmin(['privacy.personalInfoLogs'], [])
      await expect(
        payload.find({
          collection: 'personalInfoAccessLogs',
          user: granted,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()

      // create denied through the access layer (system-writer-only).
      await expect(
        payload.create({
          collection: 'personalInfoAccessLogs',
          data: {
            occurredAt: new Date().toISOString(),
            url: '/x',
            action: 'view',
            purposeCategory: 'view',
          } as never,
          user: granted,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  // ── Part 3 — purpose-gated export ──────────────────────────────────────────
  describe('purpose-gated member export', () => {
    it('REJECTS an export with no purpose (server-enforced) and logs nothing', async () => {
      const admin = await makeAdmin(['members.manage'], [siteA])
      const before = (
        await payload.find({
          collection: 'personalInfoAccessLogs',
          where: { action: { equals: 'export' } },
          pagination: false,
          overrideAccess: true,
        })
      ).totalDocs

      const resp = await handleMemberExport({
        payload,
        req: fakeReq({ pathname: '/api/members/export', user: admin, data: {} }),
      })
      expect(resp.status).toBe(400)

      const after = (
        await payload.find({
          collection: 'personalInfoAccessLogs',
          where: { action: { equals: 'export' } },
          pagination: false,
          overrideAccess: true,
        })
      ).totalDocs
      expect(after).toBe(before)
    })

    it('EXPORTS with a purpose, logs the purpose as immutable evidence (action `export`), masks PII', async () => {
      const exportSite = await makeSite()
      const admin = await makeAdmin(['members.manage'], [exportSite])
      const m1 = await makeMember(exportSite, 'exp')
      await makeMember(exportSite, 'exp')

      const purpose = unique('Reason-for-export')
      const resp = await handleMemberExport({
        payload,
        req: fakeReq({
          pathname: '/api/members/export',
          user: admin,
          data: { purpose, purposeCategory: 'export', siteId: exportSite },
        }),
      })
      expect(resp.status).toBe(200)
      const csv = await resp.text()
      // Masked (this admin lacks the privacy-officer tier): no raw PII.
      expect(csv).not.toContain(m1.loginId as string)
      expect(csv).not.toContain(m1.email as string)

      // The purpose is logged as an immutable `export` evidence row.
      const evidence = (
        await payload.find({
          collection: 'personalInfoAccessLogs',
          where: {
            and: [{ action: { equals: 'export' } }, { purposeDetail: { equals: purpose } }],
          },
          overrideAccess: true,
        })
      ).docs[0]!
      expect(evidence).toBeDefined()
      expect(evidence.purposeCategory).toBe('export')
      expect(evidence.screen).toBe('member-list-export')
      // Immutable.
      await expect(
        payload.update({
          collection: 'personalInfoAccessLogs',
          id: evidence.id,
          data: { purposeDetail: 'changed' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('a privacy officer (privacy.personalInfoLogs) gets FULL unmasked PII', async () => {
      const exportSite = await makeSite()
      const officer = await makeAdmin(['members.manage', 'privacy.personalInfoLogs'], [exportSite])
      const m1 = await makeMember(exportSite, 'full')

      const resp = await handleMemberExport({
        payload,
        req: fakeReq({
          pathname: '/api/members/export',
          user: officer,
          data: { purpose: unique('officer-export'), siteId: exportSite },
        }),
      })
      expect(resp.status).toBe(200)
      const csv = await resp.text()
      expect(csv).toContain(m1.loginId as string)
      expect(csv).toContain(m1.email as string)
    })

    it('is tenant-scoped: an admin cannot export members of a site they are not assigned to', async () => {
      const siteScoped = await makeSite()
      const siteOther = await makeSite()
      const admin = await makeAdmin(['members.manage'], [siteScoped])
      await makeMember(siteScoped, 'in')
      await makeMember(siteScoped, 'in')
      const outsider = await makeMember(siteOther, 'out')

      const resp = await handleMemberExport({
        payload,
        req: fakeReq({
          pathname: '/api/members/export',
          user: admin,
          data: { purpose: unique('scoped') },
        }),
      })
      expect(resp.status).toBe(200)
      const csv = await resp.text()
      // Exactly the two in-scope members (header + 2 rows); the other site's
      // member is filtered out by the caller-scoped read.
      const dataRows = csv.trim().split('\r\n').length - 1
      expect(dataRows).toBe(2)
      expect(csv).not.toContain(outsider.loginId as string)
    })

    it('rejects an export from an admin without members.manage (403)', async () => {
      const noGrant = await makeAdmin([], [siteA])
      const resp = await handleMemberExport({
        payload,
        req: fakeReq({
          pathname: '/api/members/export',
          user: noGrant,
          data: { purpose: unique('x') },
        }),
      })
      expect(resp.status).toBe(403)
    })
  })

  // ── Part 1 — the log-of-logs CSV export (privacy officer) ──────────────────
  describe('personal-info log CSV export (log-of-logs)', () => {
    it('gates on privacy.personalInfoLogs and masks viewer/subject/IP', async () => {
      const member = await makeMember(siteA)
      await recordPersonalInfoAccess(payload, {
        subjectMember: member as never,
        viewer: { id: 1, name: 'Secret Admin', loginId: 'secretadmin' },
        screen: 'member-detail',
        url: `/admin/collections/members/${member.id}`,
        action: 'view',
        ipAddress: '203.0.113.55',
      })

      // Roleless → 403.
      const roleless = await makeAdmin([], [])
      const denied = await handlePersonalInfoLogsExport({
        payload,
        req: fakeReq({ user: roleless }),
      })
      expect(denied.status).toBe(403)

      // Privacy officer → 200, masked.
      const officer = await makeAdmin(['privacy.personalInfoLogs'], [])
      const ok = await handlePersonalInfoLogsExport({
        payload,
        req: fakeReq({ user: officer }),
        searchParams: new URLSearchParams(`keyword=${member.id}`),
      })
      expect(ok.status).toBe(200)
      const csv = await ok.text()
      expect(csv).toContain('203.0.113.*')
      expect(csv).not.toContain('203.0.113.55')
      expect(csv).not.toContain('secretadmin')
    })
  })
})
