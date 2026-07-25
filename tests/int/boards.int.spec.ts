import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { BOARD_DEFAULT_FIELDS, INTEGRATED_BOARD_TYPE_CODE } from '@/collections/boards/defaults'
import { runSeed } from '@/seed'
import { boardTypesStep, SEED_BOARD_TYPES } from '@/seed/steps/boardTypes'
import { boardsStep, SEED_BOARDS } from '@/seed/steps/boards'
import { sitesStep } from '@/seed/steps/sites'

let payload: Payload

/** A unique-enough marker so repeated runs against the persistent dev DB don't collide. */
function marker(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

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

    // Boards need the demo site (tenant) and the built-in board types.
    await runSeed(payload, [sitesStep, boardTypesStep])

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
      const group = await payload.find({
        collection: 'codeGroups',
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      const groupId = group.docs[0]?.id
      expect(groupId).toBeDefined()

      const fourCategories = Array.from({ length: 4 }, () => ({
        classificationCode: groupId!,
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
