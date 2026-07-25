import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { toRelationId } from '@/collections/utils'
import { BOARD_DEFAULT_FIELDS, INTEGRATED_BOARD_TYPE_CODE } from '@/collections/boards/defaults'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { boardTypesStep, SEED_BOARD_TYPES } from '@/seed/steps/boardTypes'
import { boardsStep, SEED_BOARDS } from '@/seed/steps/boards'
import { sitesStep } from '@/seed/steps/sites'

let payload: Payload

/** A unique-enough marker so repeated runs against the persistent dev DB don't collide. */
function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

/** Lowercase-alphanumeric siteId (matches the Sites.ts format validator). */
function uniqueSiteId(label: string): string {
  return `t${label}${Date.now()}${Math.floor(Math.random() * 10000)}`.toLowerCase()
}

/** A letters-only unique suffix for code-format-constrained fixtures. */
function lettersOnly(): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  let out = ''
  while (n > 0) {
    out += String.fromCharCode(97 + (n % 26))
    n = Math.floor(n / 26)
  }
  return out
}

/** Any string long enough to satisfy Payload's default password requirements. */
const TEST_PASSWORD = 'a-long-enough-test-password-1'

/** Resolves a boardType id by its PG code (built-ins are seeded in beforeAll). */
async function boardTypeIdByCode(code: string): Promise<number> {
  const found = await payload.find({
    collection: 'boardTypes',
    where: { code: { equals: code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const id = found.docs[0]?.id
  if (id === undefined) {
    throw new Error(`boardType ${code} not seeded`)
  }
  return id
}

describe('board configuration engine (Task 3A)', () => {
  let demoSiteId: number
  let integratedTypeId: number
  let photoTypeId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    // Boards need the demo site (tenant), the built-in board types, and the
    // content.boards admin menu (for the tenant-scoping RBAC test).
    await runSeed(payload, [adminMenusStep, sitesStep, boardTypesStep])

    const demo = await payload.find({
      collection: 'sites',
      where: { siteId: { equals: 'demo' } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    demoSiteId = demo.docs[0]!.id
    integratedTypeId = await boardTypeIdByCode(INTEGRATED_BOARD_TYPE_CODE)
    photoTypeId = await boardTypeIdByCode('PG0002')
  })

  // ── boardTypes ─────────────────────────────────────────────────────────
  describe('boardTypes', () => {
    it('auto-generates a PGxxxx code above the current max, 4-digit zero-padded', async () => {
      const created = await payload.create({
        collection: 'boardTypes',
        data: { name: marker('AutoType'), kind: 'extended' },
        overrideAccess: true,
      })
      expect(created.code).toMatch(/^PG\d{4}$/)
      // Built-ins seed up to PG0010, so any newly generated code must exceed it.
      const numeric = Number.parseInt(created.code!.slice(2), 10)
      expect(numeric).toBeGreaterThanOrEqual(11)
    })

    it('enforces code uniqueness (concurrent creates: one wins, the other gets a clean 400)', async () => {
      const attempt = () =>
        payload.create({
          collection: 'boardTypes',
          data: { name: marker('RaceType'), kind: 'photo' },
          overrideAccess: true,
        })

      const [a, b] = await Promise.allSettled([attempt(), attempt()])
      const rejected = [a, b].filter((r) => r.status === 'rejected')
      const fulfilled = [a, b].filter((r) => r.status === 'fulfilled')

      // Both computing the same next code trips the unique index for one of
      // them; the loser must be a clean 400 ValidationError, never a raw 500.
      if (rejected.length > 0) {
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        const reason = (rejected[0] as PromiseRejectedResult).reason as { status?: unknown }
        expect(reason.status).toBe(400)
      } else {
        // If they happened to serialize, both succeeded with distinct codes.
        expect(fulfilled).toHaveLength(2)
      }
    })

    it('rejects a description longer than 800 characters', async () => {
      await expect(
        payload.create({
          collection: 'boardTypes',
          data: { name: marker('LongDesc'), kind: 'integrated', description: 'x'.repeat(801) },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts a description of exactly 800 characters', async () => {
      const created = await payload.create({
        collection: 'boardTypes',
        data: { name: marker('MaxDesc'), kind: 'integrated', description: 'x'.repeat(800) },
        overrideAccess: true,
      })
      expect(created.description).toHaveLength(800)
    })
  })

  // ── boards: basic + auto-gen + tenant ────────────────────────────────────
  describe('boards basic settings', () => {
    it('auto-generates a Bxxxxxxx bbsId and scopes the board to its tenant (site)', async () => {
      const created = await payload.create({
        collection: 'boards',
        data: { tenant: demoSiteId, name: marker('Board'), boardType: photoTypeId },
        overrideAccess: true,
      })
      expect(created.bbsId).toMatch(/^B\d{7}$/)
      const tenantId = typeof created.tenant === 'object' ? created.tenant?.id : created.tenant
      expect(tenantId).toBe(demoSiteId)
    })

    it('requires a tenant (multi-tenant scoping)', async () => {
      await expect(
        payload.create({
          collection: 'boards',
          // Intentionally omit tenant — the plugin's tenant field is required.
          data: { name: marker('NoTenant'), boardType: photoTypeId } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('enforces bbsId uniqueness (concurrent creates: one wins, the other 400s)', async () => {
      const attempt = () =>
        payload.create({
          collection: 'boards',
          data: { tenant: demoSiteId, name: marker('RaceBoard'), boardType: photoTypeId },
          overrideAccess: true,
        })

      const [a, b] = await Promise.allSettled([attempt(), attempt()])
      const rejected = [a, b].filter((r) => r.status === 'rejected')
      const fulfilled = [a, b].filter((r) => r.status === 'fulfilled')

      if (rejected.length > 0) {
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        const reason = (rejected[0] as PromiseRejectedResult).reason as { status?: unknown }
        expect(reason.status).toBe(400)
      } else {
        expect(fulfilled).toHaveLength(2)
      }
    })
  })

  // ── boards: integrated restriction ───────────────────────────────────────
  describe('integrated board restriction', () => {
    it('rejects an integrated board whose type is not PG0001', async () => {
      await expect(
        payload.create({
          collection: 'boards',
          data: {
            tenant: demoSiteId,
            name: marker('BadInteg'),
            boardType: photoTypeId,
            isIntegrated: true,
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects an integrated board with a non-common skin', async () => {
      await expect(
        payload.create({
          collection: 'boards',
          data: {
            tenant: demoSiteId,
            name: marker('BadSkin'),
            boardType: integratedTypeId,
            isIntegrated: true,
            skin: 'site',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts an integrated board with PG0001 + common skin', async () => {
      const created = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('GoodInteg'),
          boardType: integratedTypeId,
          isIntegrated: true,
          skin: 'common',
        },
        overrideAccess: true,
      })
      expect(created.isIntegrated).toBe(true)
      expect(created.skin).toBe('common')
    })
  })

  // ── boards: categories, field grid, attachments ──────────────────────────
  describe('board categories, field grid, attachments', () => {
    it('enforces at most 3 category bindings', async () => {
      // Seed our own codeGroup fixture (classification → group) rather than
      // depending on unseeded external codes — matches the rest of the suite.
      // classification.code must be letters-only; codeGroups.codeId must be
      // uppercase snake_case — both must be unique on the persistent dev DB.
      const suffix = lettersOnly()
      const classification = await payload.create({
        collection: 'codeClassifications',
        data: { code: `catfix${suffix}`, name: 'Categories fixture classification' },
        overrideAccess: true,
      })
      const group = await payload.create({
        collection: 'codeGroups',
        data: {
          codeId: `CATFIX_${suffix.toUpperCase()}`,
          name: 'Categories fixture group',
          classification: classification.id,
        },
        overrideAccess: true,
      })
      const groupId = group.id

      const fourCategories = Array.from({ length: 4 }, () => ({
        classificationCode: groupId,
        useFlag: true,
      }))

      await expect(
        payload.create({
          collection: 'boards',
          data: {
            tenant: demoSiteId,
            name: marker('FourCats'),
            boardType: photoTypeId,
            categories: fourCategories,
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('defaults the field grid to the built-in fields incl. extraField/extraContent', async () => {
      const created = await payload.create({
        collection: 'boards',
        data: { tenant: demoSiteId, name: marker('Grid'), boardType: photoTypeId },
        overrideAccess: true,
      })

      const keys = (created.fields ?? []).map((f) => f.fieldKey)
      expect(created.fields).toHaveLength(BOARD_DEFAULT_FIELDS.length)
      expect(keys).toContain('title')
      // ref 1-30: the attachment row is part of the field grid (distinct from
      // the Basic-Settings attachmentsEnabled toggle).
      expect(keys).toContain('attachment')
      for (let i = 1; i <= 4; i++) {
        expect(keys).toContain(`extraField${i}`)
        expect(keys).toContain(`extraContent${i}`)
      }
      // Default list/detail ordering arrays are populated.
      expect((created.listFieldOrder ?? []).length).toBeGreaterThan(0)
      expect((created.detailFieldOrder ?? []).length).toBeGreaterThan(0)
    })

    it('rejects a malformed attachmentAllowedExtensions value', async () => {
      await expect(
        payload.create({
          collection: 'boards',
          data: {
            tenant: demoSiteId,
            name: marker('BadExt'),
            boardType: photoTypeId,
            attachmentsEnabled: true,
            attachmentAllowedExtensions: 'HWP, pdf', // uppercase + space
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts a well-formed lowercase comma-separated extension list', async () => {
      const created = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('GoodExt'),
          boardType: photoTypeId,
          attachmentsEnabled: true,
          attachmentAllowedExtensions: 'hwp,pdf,png',
        },
        overrideAccess: true,
      })
      expect(created.attachmentAllowedExtensions).toBe('hwp,pdf,png')
    })
  })

  // ── M-1: system-generated IDs are not client-settable ────────────────────
  describe('system-generated ID write protection (code / bbsId)', () => {
    let superUser: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const role = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_SUPER_${lettersOnly().toUpperCase()}`,
          name: 'Test super role (field-protection)',
          description: 'isSuper test role for field-write-protection tests.',
          isSuper: true,
        },
        overrideAccess: true,
      })
      superUser = await payload.create({
        collection: 'users',
        data: {
          email: `super-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [role.id],
          status: 'active',
        },
        overrideAccess: true,
      })
    })

    it('ignores a client-supplied boardTypes.code and uses the server value', async () => {
      const created = await payload.create({
        collection: 'boardTypes',
        // Bogus non-PG value a crafted request might send.
        data: { name: marker('CraftedType'), kind: 'photo', code: 'HACKED9999' } as never,
        user: superUser,
        overrideAccess: false,
      })
      expect(created.code).toMatch(/^PG\d{4}$/)
      expect(created.code).not.toBe('HACKED9999')

      // An update attempting to rewrite the code is ignored (value unchanged).
      const updated = await payload.update({
        collection: 'boardTypes',
        id: created.id,
        data: { code: 'PG0000' } as never,
        user: superUser,
        overrideAccess: false,
      })
      expect(updated.code).toBe(created.code)
    })

    it('ignores a client-supplied boards.bbsId and uses the server value', async () => {
      const created = await payload.create({
        collection: 'boards',
        data: {
          tenant: demoSiteId,
          name: marker('CraftedBoard'),
          boardType: photoTypeId,
          bbsId: 'B9999999',
        } as never,
        user: superUser,
        overrideAccess: false,
      })
      expect(created.bbsId).toMatch(/^B\d{7}$/)
      expect(created.bbsId).not.toBe('B9999999')

      const updated = await payload.update({
        collection: 'boards',
        id: created.id,
        data: { bbsId: 'B0000000' } as never,
        user: superUser,
        overrideAccess: false,
      })
      expect(updated.bbsId).toBe(created.bbsId)
    })
  })

  // ── H-1: real per-user tenant scoping (the key regression) ────────────────
  describe('tenant scoping (per-user, overrideAccess:false)', () => {
    let siteAId: number
    let siteBId: number
    let boardAId: number
    let boardBId: number
    let scopedUser: Awaited<ReturnType<typeof payload.create>>
    let superUser: Awaited<ReturnType<typeof payload.create>>

    beforeAll(async () => {
      const siteA = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('a'), name: 'Tenant A', url: 'https://a.example.com' },
        overrideAccess: true,
      })
      const siteB = await payload.create({
        collection: 'sites',
        data: { siteId: uniqueSiteId('b'), name: 'Tenant B', url: 'https://b.example.com' },
        overrideAccess: true,
      })
      siteAId = siteA.id
      siteBId = siteB.id

      const boardA = await payload.create({
        collection: 'boards',
        data: { tenant: siteAId, name: marker('BoardA'), boardType: photoTypeId },
        overrideAccess: true,
      })
      const boardB = await payload.create({
        collection: 'boards',
        data: { tenant: siteBId, name: marker('BoardB'), boardType: photoTypeId },
        overrideAccess: true,
      })
      boardAId = boardA.id
      boardBId = boardB.id

      // A NON-super role granting content.boards.
      const boardsMenu = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: 'content.boards' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const boardsMenuId = boardsMenu.docs[0]?.id
      if (boardsMenuId === undefined) {
        throw new Error('content.boards adminMenu not found — did adminMenusStep run in beforeAll?')
      }

      const scopedRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_BOARDS_${lettersOnly().toUpperCase()}`,
          name: 'Boards-only test role',
          description: 'Grants content.boards only (non-super).',
          menuGrants: [boardsMenuId],
        },
        overrideAccess: true,
      })
      // Non-super user assigned ONLY to site A (multi-tenant users.tenants).
      scopedUser = await payload.create({
        collection: 'users',
        data: {
          email: `scoped-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [scopedRole.id],
          tenants: [{ tenant: siteAId }],
          status: 'active',
        } as never,
        overrideAccess: true,
      })

      const superRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_SUPER_${lettersOnly().toUpperCase()}`,
          name: 'Test super role (tenant)',
          description: 'isSuper test role for tenant-scoping tests.',
          isSuper: true,
        },
        overrideAccess: true,
      })
      superUser = await payload.create({
        collection: 'users',
        data: {
          email: `tsuper-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [superRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })
    })

    it('a non-super user assigned to site A reads site A boards but NOT site B boards', async () => {
      const found = await payload.find({
        collection: 'boards',
        user: scopedUser,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const ids = found.docs.map((d) => d.id)
      expect(ids).toContain(boardAId)
      expect(ids).not.toContain(boardBId)
    })

    it('a non-super user is DENIED reading a specific site B board (cross-tenant)', async () => {
      await expect(
        payload.findByID({
          collection: 'boards',
          id: boardBId,
          user: scopedUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('a non-super user can create a board on their own site A', async () => {
      const created = await payload.create({
        collection: 'boards',
        data: { tenant: siteAId, name: marker('ScopedCreateA'), boardType: photoTypeId },
        user: scopedUser,
        overrideAccess: false,
      })
      expect(created.id).toBeDefined()
    })

    it('a non-super user is DENIED creating a board on site B (cross-tenant)', async () => {
      await expect(
        payload.create({
          collection: 'boards',
          data: { tenant: siteBId, name: marker('ScopedCreateB'), boardType: photoTypeId },
          user: scopedUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('a non-super user is DENIED updating a site B board (cross-tenant)', async () => {
      await expect(
        payload.update({
          collection: 'boards',
          id: boardBId,
          data: { name: marker('ScopedUpdateB') },
          user: scopedUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('an isSuper user reads AND writes boards on both sites', async () => {
      const found = await payload.find({
        collection: 'boards',
        user: superUser,
        overrideAccess: false,
        pagination: false,
        limit: 0,
      })
      const ids = found.docs.map((d) => d.id)
      expect(ids).toContain(boardAId)
      expect(ids).toContain(boardBId)

      // Can read a specific site B board.
      await expect(
        payload.findByID({
          collection: 'boards',
          id: boardBId,
          user: superUser,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()

      // Can create on site B.
      await expect(
        payload.create({
          collection: 'boards',
          data: { tenant: siteBId, name: marker('SuperCreateB'), boardType: photoTypeId },
          user: superUser,
          overrideAccess: false,
        }),
      ).resolves.toBeDefined()
    })

    // ── NEW-1: the tenant boundary itself must not be self-mutable ──────────
    it('a non-super user CANNOT self-assign tenants (privilege-escalation guard)', async () => {
      // Self-PATCH attempting to add site B to their own tenants. The doc-level
      // update is allowed (self-access), but the `tenants` field write must be
      // stripped by field-level access — mirrors the users.roles guard.
      const patched = await payload.update({
        collection: 'users',
        id: scopedUser.id,
        data: { tenants: [{ tenant: siteAId }, { tenant: siteBId }] } as never,
        user: scopedUser,
        overrideAccess: false,
      })
      const patchedTenantIds = ((patched.tenants ?? []) as { tenant?: unknown }[]).map((t) =>
        toRelationId(t.tenant),
      )
      expect(patchedTenantIds).not.toContain(siteBId)

      // Reload independently (overrideAccess:true) to prove it did NOT persist.
      const reloaded = await payload.findByID({
        collection: 'users',
        id: scopedUser.id,
        overrideAccess: true,
      })
      const reloadedTenantIds = ((reloaded.tenants ?? []) as { tenant?: unknown }[]).map((t) =>
        toRelationId(t.tenant),
      )
      expect(reloadedTenantIds).toContain(siteAId)
      expect(reloadedTenantIds).not.toContain(siteBId)

      // And the failed escalation did NOT unlock site B boards for them.
      await expect(
        payload.findByID({
          collection: 'boards',
          id: boardBId,
          user: reloaded,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('a system.admins holder CAN assign tenants to a user', async () => {
      const adminsMenu = await payload.find({
        collection: 'adminMenus',
        where: { menuKey: { equals: 'system.admins' } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const adminsMenuId = adminsMenu.docs[0]?.id
      if (adminsMenuId === undefined) {
        throw new Error('system.admins adminMenu not found — did adminMenusStep run?')
      }

      const adminRole = await payload.create({
        collection: 'roles',
        data: {
          roleId: `ROLE_TEST_ADMINS_${lettersOnly().toUpperCase()}`,
          name: 'Admins-holder test role',
          description: 'Grants system.admins (non-super).',
          menuGrants: [adminsMenuId],
        },
        overrideAccess: true,
      })
      const adminUser = await payload.create({
        collection: 'users',
        data: {
          email: `admins-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          roles: [adminRole.id],
          status: 'active',
        },
        overrideAccess: true,
      })
      const targetUser = await payload.create({
        collection: 'users',
        data: {
          email: `target-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
          password: TEST_PASSWORD,
          status: 'active',
        },
        overrideAccess: true,
      })

      const assigned = await payload.update({
        collection: 'users',
        id: targetUser.id,
        data: { tenants: [{ tenant: siteBId }] } as never,
        user: adminUser,
        overrideAccess: false,
      })
      const assignedTenantIds = ((assigned.tenants ?? []) as { tenant?: unknown }[]).map((t) =>
        toRelationId(t.tenant),
      )
      expect(assignedTenantIds).toContain(siteBId)

      const reloadedTarget = await payload.findByID({
        collection: 'users',
        id: targetUser.id,
        overrideAccess: true,
      })
      const reloadedIds = ((reloadedTarget.tenants ?? []) as { tenant?: unknown }[]).map((t) =>
        toRelationId(t.tenant),
      )
      expect(reloadedIds).toContain(siteBId)
    })
  })

  // ── seeds ────────────────────────────────────────────────────────────────
  describe('board seeds', () => {
    it('seeds board types + example boards idempotently', async () => {
      // Re-run both steps twice: the second pass must find everything and skip.
      await runSeed(payload, [boardTypesStep, boardsStep])
      await runSeed(payload, [boardTypesStep, boardsStep])

      for (const type of SEED_BOARD_TYPES) {
        const found = await payload.find({
          collection: 'boardTypes',
          where: { code: { equals: type.code } },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs).toHaveLength(1)
        expect(found.docs[0]?.kind).toBe(type.kind)
      }

      for (const board of SEED_BOARDS) {
        const found = await payload.find({
          collection: 'boards',
          where: {
            and: [{ tenant: { equals: demoSiteId } }, { name: { equals: board.name } }],
          },
          limit: 2,
          pagination: false,
          overrideAccess: true,
        })
        expect(found.docs).toHaveLength(1)
        expect(found.docs[0]?.isIntegrated).toBe(board.isIntegrated)
      }
    })
  })
})
