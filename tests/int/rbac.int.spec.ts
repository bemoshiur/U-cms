import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { ROLE_ADMIN_ROLE_ID, rolesStep } from '@/seed/steps/roles'
import {
  DEFAULT_SEED_ADMIN_EMAIL,
  DEFAULT_SEED_ADMIN_PASSWORD,
  superAdminStep,
} from '@/seed/steps/superAdmin'

let payload: Payload

/** Generates a fresh unique string per test, matching the convention used in sites.int.spec.ts. */
function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
}

function uniqueSiteId(label: string): string {
  return unique(`test${label}`).toLowerCase()
}

function uniqueRoleId(label: string): string {
  return `ROLE_TEST_${unique(label).toUpperCase()}`
}

function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`
}

/** Any string long enough to satisfy Payload's default password requirements. */
const TEST_PASSWORD = 'a-long-enough-test-password-1'

describe('rbac: roles, adminMenus, and menu-based access control', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
    // Guarantee the menu tree + ROLE_ADMIN + super-admin assignment exist
    // regardless of which other int spec files already ran against this
    // shared dev DB (vitest.config.mts serializes files, but doesn't
    // guarantee an ordering across spec files).
    await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
  })

  describe('roles.roleId format validation', () => {
    it('rejects a roleId missing the ROLE_ prefix', async () => {
      await expect(
        payload.create({
          collection: 'roles',
          data: { roleId: 'ADMIN', name: 'Bad', description: 'x' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects a lowercase roleId', async () => {
      await expect(
        payload.create({
          collection: 'roles',
          data: { roleId: 'role_admin', name: 'Bad', description: 'x' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects an empty-string roleId', async () => {
      await expect(
        payload.create({
          collection: 'roles',
          data: { roleId: '', name: 'Bad', description: 'x' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts a valid roleId', async () => {
      const roleId = uniqueRoleId('VALID')
      const created = await payload.create({
        collection: 'roles',
        data: { roleId, name: 'Valid Role', description: 'A valid test role.' },
        overrideAccess: true,
      })
      expect(created.roleId).toBe(roleId)
    })
  })

  describe('seed: ROLE_ADMIN + super-admin assignment', () => {
    it('creates ROLE_ADMIN (isSuper) idempotently and assigns it to the seeded super-admin', async () => {
      // Run twice — idempotency.
      await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])
      await runSeed(payload, [adminMenusStep, rolesStep, superAdminStep])

      const roleAdmin = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: ROLE_ADMIN_ROLE_ID } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      expect(roleAdmin.docs).toHaveLength(1)
      expect(roleAdmin.docs[0]?.isSuper).toBe(true)

      const email = process.env.SEED_ADMIN_EMAIL || DEFAULT_SEED_ADMIN_EMAIL
      const superAdmin = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      expect(superAdmin.docs).toHaveLength(1)

      const roleIds = (superAdmin.docs[0]?.roles ?? []).map(toRelationId)
      expect(roleIds).toContain(roleAdmin.docs[0]?.id)
    })
  })

  describe('overrideAccess:false — menu-gated collection access (proves the wiring is real, not just present)', () => {
    it('a roleless user is denied create on sites (but CAN read — see the Sites.ts access comment)', async () => {
      const roleless = await payload.create({
        collection: 'users',
        data: { email: uniqueEmail('roleless'), password: TEST_PASSWORD, status: 'active' },
        overrideAccess: true,
      })

      await expect(
        payload.create({
          collection: 'sites',
          data: { siteId: uniqueSiteId('denied'), name: 'Denied Site', url: 'https://example.com' },
          user: roleless,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // `sites.read` is deliberately open to any authenticated user (not
      // gated behind `system.sites` like every other collection here) —
      // discovered via the manual login+admin-flow check: the multi-tenant
      // plugin's `TenantSelectionProvider` reads `sites` unconditionally on
      // every admin page render for every user, and gating `read` crashed
      // the entire admin UI (HTTP 500) for anyone lacking that one grant.
      // See the design-decision comment on `access.read` in
      // `src/collections/Sites.ts`.
      await expect(
        payload.find({
          collection: 'sites',
          user: roleless,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
    })

    it('a user with a role granting system.sites can read+create sites but NOT departments', async () => {
      const sitesMenu = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: 'system.sites' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const sitesMenuId = sitesMenu.docs[0]?.id
      if (sitesMenuId === undefined) {
        throw new Error(
          '"system.sites" adminMenu not found — did the adminMenus seed step run in beforeAll?',
        )
      }

      const role = await payload.create({
        collection: 'roles',
        data: {
          roleId: uniqueRoleId('SITES'),
          name: 'Sites-only test role',
          description: 'Grants system.sites only.',
          menuGrants: [sitesMenuId],
        },
        overrideAccess: true,
      })

      const user = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('sitesuser'),
          password: TEST_PASSWORD,
          roles: [role.id],
          status: 'active',
        },
        overrideAccess: true,
      })

      // Allowed: sites.
      const created = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('granted'), name: 'Granted Site', url: 'https://example.com' },
        user,
        overrideAccess: false,
      })
      expect(created.id).toBeDefined()

      const foundSites = await payload.find({
        collection: 'sites',
        user,
        overrideAccess: false,
      })
      expect(foundSites.docs.length).toBeGreaterThan(0)

      // Denied: departments (no grant for system.departments).
      await expect(
        payload.create({
          collection: 'departments',
          data: { name: 'Should Fail Department' },
          user,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      await expect(
        payload.find({
          collection: 'departments',
          user,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('an isSuper user can access every menu-gated collection unconditionally', async () => {
      const superRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: uniqueRoleId('SUPER'),
          name: 'Test super role',
          description: 'isSuper test role — no explicit menuGrants.',
          isSuper: true,
        },
        overrideAccess: true,
      })

      const user = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('superuser'),
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })

      await expect(
        payload.create({
          collection: 'sites',
          data: { siteId: uniqueSiteId('super'), name: 'Super Site', url: 'https://example.com' },
          user,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()

      await expect(
        payload.create({
          collection: 'departments',
          data: { name: 'Super Dept' },
          user,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()

      await expect(
        payload.find({
          collection: 'roles',
          user,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
    })
  })

  describe('users self-access override', () => {
    it("a roleless user can read and update their own doc, but not someone else's", async () => {
      const roleless = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('self'),
          password: TEST_PASSWORD,
          name: 'Original Name',
          status: 'active',
        },
        overrideAccess: true,
      })

      const self = await payload.findByID({
        collection: 'users',
        id: roleless.id,
        user: roleless,
        overrideAccess: false,
      })
      expect(self.id).toBe(roleless.id)

      const updated = await payload.update({
        collection: 'users',
        id: roleless.id,
        data: { name: 'Updated Name' },
        user: roleless,
        overrideAccess: false,
      })
      expect(updated.name).toBe('Updated Name')

      const other = await payload.create({
        collection: 'users',
        data: { email: uniqueEmail('other'), password: TEST_PASSWORD, status: 'active' },
        overrideAccess: true,
      })

      await expect(
        payload.findByID({
          collection: 'users',
          id: other.id,
          user: roleless,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  describe('privilege escalation regression (C1 — self-assign super-admin via users.roles)', () => {
    it('a roleless user cannot self-assign ROLE_ADMIN by PATCHing their own roles field', async () => {
      const roleAdmin = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: ROLE_ADMIN_ROLE_ID } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const roleAdminId = roleAdmin.docs[0]?.id
      if (roleAdminId === undefined) {
        throw new Error('ROLE_ADMIN not found — did the roles seed step run in beforeAll?')
      }

      const roleless = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('escalate'),
          password: TEST_PASSWORD,
          name: 'Before',
          status: 'active',
        },
        overrideAccess: true,
      })
      expect(roleless.roles ?? []).toHaveLength(0)

      // Self-update is allowed at the document level (selfOrMenuAccess),
      // so this call must NOT throw — but the field-level gate on
      // `users.roles` must silently drop the `roles` write while still
      // applying the other (legitimate) field change in the same request,
      // exactly like a real HTTP PATCH would behave.
      const updateResult = await payload.update({
        collection: 'users',
        id: roleless.id,
        data: { name: 'After', roles: [roleAdminId] },
        user: roleless,
        overrideAccess: false,
      })
      expect(updateResult.name).toBe('After')
      expect(updateResult.roles ?? []).toHaveLength(0)

      // Re-fetch independently (overrideAccess:true, bypassing our own
      // access layer entirely) to prove the escalation didn't persist —
      // not just that the mutation response looked clean.
      const reloaded = await payload.findByID({
        collection: 'users',
        id: roleless.id,
        overrideAccess: true,
      })
      expect(reloaded.roles ?? []).toHaveLength(0)
      expect(reloaded.name).toBe('After')
    })

    it('a departments-only user cannot self-assign ROLE_ADMIN either', async () => {
      const departmentsMenu = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: 'system.departments' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const departmentsMenuId = departmentsMenu.docs[0]?.id
      if (departmentsMenuId === undefined) {
        throw new Error('"system.departments" adminMenu not found — did the adminMenus seed run?')
      }

      const roleAdmin = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: ROLE_ADMIN_ROLE_ID } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const roleAdminId = roleAdmin.docs[0]?.id
      if (roleAdminId === undefined) {
        throw new Error('ROLE_ADMIN not found — did the roles seed step run in beforeAll?')
      }

      const deptRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: uniqueRoleId('ESCALATEDEPT'),
          name: 'Departments-only test role',
          description: 'Grants system.departments only — no system.admins.',
          menuGrants: [departmentsMenuId],
        },
        overrideAccess: true,
      })

      const deptUser = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('escalatedept'),
          password: TEST_PASSWORD,
          roles: [deptRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })

      const updateResult = await payload.update({
        collection: 'users',
        id: deptUser.id,
        data: { roles: [deptRole.id, roleAdminId] },
        user: deptUser,
        overrideAccess: false,
      })
      const updatedRoleIds = (updateResult.roles ?? []).map(toRelationId)
      expect(updatedRoleIds).not.toContain(roleAdminId)

      const reloaded = await payload.findByID({
        collection: 'users',
        id: deptUser.id,
        overrideAccess: true,
      })
      const reloadedRoleIds = (reloaded.roles ?? []).map(toRelationId)
      expect(reloadedRoleIds).not.toContain(roleAdminId)
    })

    it('a system.admins-holding user CAN still assign roles to another user', async () => {
      const adminsMenu = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: 'system.admins' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const adminsMenuId = adminsMenu.docs[0]?.id
      if (adminsMenuId === undefined) {
        throw new Error('"system.admins" adminMenu not found — did the adminMenus seed run?')
      }

      const grantRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: uniqueRoleId('GRANTROLE'),
          name: 'Grants-only test role',
          description: 'Some non-admin, non-relevant grant for the assigner.',
          menuGrants: [adminsMenuId],
        },
        overrideAccess: true,
      })

      const adminUser = await payload.create({
        collection: 'users',
        data: {
          email: uniqueEmail('adminsholder'),
          password: TEST_PASSWORD,
          roles: [grantRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })

      const targetUser = await payload.create({
        collection: 'users',
        data: { email: uniqueEmail('assignedtarget'), password: TEST_PASSWORD, status: 'active' },
        overrideAccess: true,
      })

      const assigned = await payload.update({
        collection: 'users',
        id: targetUser.id,
        data: { roles: [grantRole.id] },
        user: adminUser,
        overrideAccess: false,
      })
      const assignedRoleIds = (assigned.roles ?? []).map(toRelationId)
      expect(assignedRoleIds).toContain(grantRole.id)

      const reloaded = await payload.findByID({
        collection: 'users',
        id: targetUser.id,
        overrideAccess: true,
      })
      const reloadedRoleIds = (reloaded.roles ?? []).map(toRelationId)
      expect(reloadedRoleIds).toContain(grantRole.id)
    })
  })

  describe('login', () => {
    it('the seeded super-admin can still log in after the RBAC wiring', async () => {
      const email = process.env.SEED_ADMIN_EMAIL || DEFAULT_SEED_ADMIN_EMAIL
      const password = process.env.SEED_ADMIN_PASSWORD || DEFAULT_SEED_ADMIN_PASSWORD

      const result = await payload.login({ collection: 'users', data: { email, password } })
      expect(result.user).toBeDefined()
      expect(result.user?.email).toBe(email)
      expect(result.token).toBeTruthy()
    })
  })
})
