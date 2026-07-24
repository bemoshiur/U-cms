import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { recordAccess } from '@/audit/recordAccess'
import { recordLoginFailure } from '@/audit/authHooks'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'

let payload: Payload

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
  return `ROLE_AUD_${unique(label).toUpperCase()}`
}

const TEST_PASSWORD = 'a-long-enough-test-password-1'

/** Builds a minimal PayloadRequest-like object carrying headers + actor. */
function fakeReq(args: {
  headers?: Record<string, string>
  pathname?: string
  url?: string
  user?: unknown
  data?: Record<string, unknown>
}): PayloadRequest {
  return {
    payload,
    headers: new Headers(args.headers ?? {}),
    pathname: args.pathname,
    url: args.url,
    user: args.user,
    data: args.data,
    context: {},
  } as unknown as PayloadRequest
}

async function menuIdForKey(menuKey: string): Promise<number> {
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

describe('audit & logging backbone (Task 2A)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
  })

  describe('recordAccess writer', () => {
    it('writes an accessLog with actorLabel, x-forwarded-for IP (first hop), menuKey and action', async () => {
      const loginId = uniqueLoginId('actor')
      const actor = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('actor'),
          password: TEST_PASSWORD,
          name: 'Actor Name',
          loginId,
          status: 'active',
        },
        overrideAccess: true,
      })

      const url = `/bos/test/${unique('u')}`
      await recordAccess(payload, {
        req: fakeReq({
          headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
          pathname: url,
          user: actor,
        }),
        action: 'view',
        menuKey: 'system.sites',
        menuLabel: 'Site Information Management',
        url,
      })

      const found = await payload.find({
        collection: 'accessLogs',
        where: { url: { equals: url } },
        overrideAccess: true,
      })
      expect(found.docs).toHaveLength(1)
      const row = found.docs[0]!
      expect(row.action).toBe('view')
      expect(row.ipAddress).toBe('203.0.113.5')
      expect(row.actorLabel).toBe(`Actor Name(${loginId})`)
      expect(row.menuKey).toBe('system.sites')
      expect(toRelationId(row.actor)).toBe(actor.id)
    })

    it('never throws even if the underlying write is impossible (contract: protect the audited action)', async () => {
      // `action` is required + enum-constrained; an invalid one would reject a
      // raw create, but recordAccess must swallow it and resolve.
      await expect(
        recordAccess(payload, {
          req: fakeReq({}),
          action: 'not-a-valid-action' as never,
          url: '/x',
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe('mutation on a Phase 1 collection produces accessLogs (create/update/delete)', () => {
    it('logs create, update and delete of a department against the actor', async () => {
      const actor = await payload.create({
        collection: 'users',
        data: { email: uniqueEmail('mut'), password: TEST_PASSWORD, name: 'Mut', status: 'active' },
        overrideAccess: true,
      })

      const dept = await payload.create({
        collection: 'departments',
        data: { name: unique('Dept ') },
        user: actor,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'departments',
        id: dept.id,
        data: { name: unique('Dept Renamed ') },
        user: actor,
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'departments',
        id: dept.id,
        user: actor,
        overrideAccess: true,
      })

      const logs = await payload.find({
        collection: 'accessLogs',
        where: { actor: { equals: actor.id } },
        overrideAccess: true,
        pagination: false,
      })
      const actions = logs.docs.map((d) => d.action)
      expect(actions).toContain('create')
      expect(actions).toContain('update')
      expect(actions).toContain('delete')
      // All tagged with the department menuKey.
      expect(logs.docs.every((d) => d.menuKey === 'system.departments')).toBe(true)
    })
  })

  describe('login writes accessLog + loginHistory + lastLoginAt', () => {
    it('records a login event, a success loginHistory row, and stamps lastLoginAt', async () => {
      const email = uniqueEmail('login')
      const loginId = uniqueLoginId('login')
      const user = await payload.create({
        collection: 'users',
        data: { email, password: TEST_PASSWORD, name: 'Login User', loginId, status: 'active' },
        overrideAccess: true,
      })

      const result = await payload.login({
        collection: 'users',
        data: { email, password: TEST_PASSWORD },
      })
      expect(result.user?.id).toBe(user.id)

      // Login rows carry identity via actorLabel (the `actor` FK is deliberately
      // omitted on auth events — see `linkActor` in recordAccess).
      const accessLogs = await payload.find({
        collection: 'accessLogs',
        where: {
          and: [
            { actorLabel: { equals: `Login User(${loginId})` } },
            { action: { equals: 'login' } },
          ],
        },
        overrideAccess: true,
      })
      expect(accessLogs.docs.length).toBeGreaterThanOrEqual(1)

      const loginRows = await payload.find({
        collection: 'loginHistory',
        where: { and: [{ loginId: { equals: loginId } }, { success: { equals: true } }] },
        overrideAccess: true,
      })
      expect(loginRows.docs.length).toBeGreaterThanOrEqual(1)
      expect(loginRows.docs[0]!.userLabel).toBe('Login User')
      expect(loginRows.docs[0]!.isOverseas).toBe(false)
      expect(loginRows.docs[0]!.isMobile).toBe(false)

      const reloaded = await payload.findByID({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
      })
      expect(reloaded.lastLoginAt).toBeTruthy()
    })
  })

  describe('failed login writes a failure loginHistory row (afterError hook)', () => {
    it('records success:false with the attempted identifier and IP', async () => {
      const attempted = uniqueEmail('fail')
      await recordLoginFailure({
        collection: { slug: 'users' },
        error: new Error('The email or password provided is incorrect.'),
        req: fakeReq({
          headers: { 'x-forwarded-for': '8.8.8.8' },
          pathname: '/api/users/login',
          data: { email: attempted, password: 'wrong-password' },
        }),
        context: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const rows = await payload.find({
        collection: 'loginHistory',
        where: { loginId: { equals: attempted } },
        overrideAccess: true,
      })
      expect(rows.docs).toHaveLength(1)
      expect(rows.docs[0]!.success).toBe(false)
      expect(rows.docs[0]!.ipAddress).toBe('8.8.8.8')
      expect(rows.docs[0]!.failReason).toContain('incorrect')
    })

    it('does NOT record for a non-login error on the users collection (filtered by path)', async () => {
      const attempted = uniqueEmail('notlogin')
      await recordLoginFailure({
        collection: { slug: 'users' },
        error: new Error('some other users error'),
        req: fakeReq({ pathname: '/api/users', data: { email: attempted } }),
        context: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      const rows = await payload.find({
        collection: 'loginHistory',
        where: { loginId: { equals: attempted } },
        overrideAccess: true,
      })
      expect(rows.docs).toHaveLength(0)
    })
  })

  describe('roles change on a user writes a permissionChangeLog with the correct summary', () => {
    it('journals a grant with a before→after roles summary', async () => {
      const roleId = uniqueRoleId('GRANT')
      const role = await payload.create({
        collection: 'roles',
        data: { roleId, name: 'Grant role', description: 'x' },
        overrideAccess: true,
      })
      const user = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('perm'),
          password: TEST_PASSWORD,
          name: 'Perm User',
          status: 'active',
        },
        overrideAccess: true,
      })

      await payload.update({
        collection: 'users',
        id: user.id,
        data: { roles: [role.id] },
        overrideAccess: true,
      })

      const logs = await payload.find({
        collection: 'permissionChangeLogs',
        where: { targetUserId: { equals: String(user.id) } },
        overrideAccess: true,
      })
      expect(logs.docs).toHaveLength(1)
      expect(logs.docs[0]!.changeSummary).toBe(`roles: [] → [${roleId}]`)
      expect(logs.docs[0]!.targetUserEmail).toBe(user.email)
    })
  })

  describe('menuGrants change on a role writes a menuPermissionLog with added/removed + member snapshot', () => {
    it('journals added then removed menus with the role members snapshot', async () => {
      const sitesMenuId = await menuIdForKey('system.sites')
      const roleId = uniqueRoleId('MENU')
      const role = await payload.create({
        collection: 'roles',
        data: { roleId, name: 'Menu role', description: 'x' },
        overrideAccess: true,
      })
      // A member, so the snapshot is non-empty.
      const member = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('member'),
          password: TEST_PASSWORD,
          name: 'Member One',
          loginId: uniqueLoginId('member'),
          roles: [role.id],
          status: 'active',
        },
        overrideAccess: true,
      })

      // Add the sites menu grant.
      await payload.update({
        collection: 'roles',
        id: role.id,
        data: { menuGrants: [sitesMenuId] },
        overrideAccess: true,
      })
      // Remove it again.
      await payload.update({
        collection: 'roles',
        id: role.id,
        data: { menuGrants: [] },
        overrideAccess: true,
      })

      const logs = await payload.find({
        collection: 'menuPermissionLogs',
        where: { roleId: { equals: roleId } },
        overrideAccess: true,
        sort: 'createdAt',
        pagination: false,
      })
      expect(logs.docs.length).toBe(2)

      const addRow = logs.docs.find(
        (d) => Array.isArray(d.addedMenus) && (d.addedMenus as unknown[]).length > 0,
      )!
      expect(addRow.addedMenus).toContain('Site Information Management')
      expect(addRow.removedMenus).toEqual([])
      expect(addRow.roleMemberSnapshot).toContain(`Member One(${member.loginId})`)

      const removeRow = logs.docs.find(
        (d) => Array.isArray(d.removedMenus) && (d.removedMenus as unknown[]).length > 0,
      )!
      expect(removeRow.removedMenus).toContain('Site Information Management')
      expect(removeRow.addedMenus).toEqual([])
    })
  })

  describe('logs are immutable (append-only)', () => {
    it('rejects update even for a super-admin, and even under overrideAccess', async () => {
      // Grab any existing accessLog row.
      const any = await payload.find({ collection: 'accessLogs', limit: 1, overrideAccess: true })
      const logId = any.docs[0]!.id

      const superRole = await payload.create({
        collection: 'roles',
        data: { roleId: uniqueRoleId('SUPER'), name: 'Super', description: 'x', isSuper: true },
        overrideAccess: true,
      })
      const superUser = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('super'),
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })

      // (a) Access layer rejects a super-admin update.
      await expect(
        payload.update({
          collection: 'accessLogs',
          id: logId,
          data: { url: '/tampered' },
          user: superUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // (b) Defense-in-depth: even overrideAccess is rejected by the beforeChange guard.
      await expect(
        payload.update({
          collection: 'accessLogs',
          id: logId,
          data: { url: '/tampered' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })
  })

  describe('read/delete gated on the privacy menuKeys', () => {
    it('denies a roleless user read + delete, but allows a privacy-granted user', async () => {
      const roleless = await payload.create({
        collection: 'users',
        data: { email: uniqueEmail('nolog'), password: TEST_PASSWORD, status: 'active' },
        overrideAccess: true,
      })

      await expect(
        payload.find({ collection: 'accessLogs', user: roleless, overrideAccess: false }),
      ).rejects.toThrow()

      const any = await payload.find({ collection: 'accessLogs', limit: 1, overrideAccess: true })
      const logId = any.docs[0]!.id
      await expect(
        payload.delete({
          collection: 'accessLogs',
          id: logId,
          user: roleless,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // A user holding privacy.accessLogs may read.
      const accessLogsMenuId = await menuIdForKey('privacy.accessLogs')
      const auditRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: uniqueRoleId('AUDIT'),
          name: 'Audit viewer',
          description: 'x',
          menuGrants: [accessLogsMenuId],
        },
        overrideAccess: true,
      })
      const auditor = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('auditor'),
          password: TEST_PASSWORD,
          roles: [auditRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })
      await expect(
        payload.find({ collection: 'accessLogs', user: auditor, overrideAccess: false }),
      ).resolves.toBeDefined()
    })
  })
})
