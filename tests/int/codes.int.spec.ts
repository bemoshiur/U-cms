import type { Payload } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { codesStep, SEED_CLASSIFICATION, SEED_CODE_GROUPS } from '@/seed/steps/codes'

let payload: Payload

/**
 * Generates a letters-only unique suffix so tests exercising the
 * letters-only (`codeClassifications.code`) / uppercase-snake-case
 * (`codeGroups.codeId`) format constraints can still produce a
 * collision-free value across repeated runs against a persistent dev DB
 * (a numeric/timestamp suffix, as used elsewhere in this repo's tests,
 * would fail those format checks).
 */
function uniqueLetters(prefix: string): string {
  let n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  let suffix = ''
  while (n > 0) {
    suffix += String.fromCharCode(97 + (n % 26))
    n = Math.floor(n / 26)
  }
  return `${prefix}${suffix}`
}

describe('code management collections', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  describe('codeClassifications', () => {
    it('rejects a code containing non-letter characters', async () => {
      await expect(
        payload.create({
          collection: 'codeClassifications',
          data: { code: uniqueLetters('bad') + '1', name: 'Bad classification' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects an empty-string code', async () => {
      await expect(
        payload.create({
          collection: 'codeClassifications',
          data: { code: '', name: 'Empty code classification' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts a letters-only code', async () => {
      const code = uniqueLetters('cls')
      const created = await payload.create({
        collection: 'codeClassifications',
        data: { code, name: 'Valid classification' },
        overrideAccess: true,
      })
      expect(created.code).toBe(code)
    })
  })

  describe('codeGroups', () => {
    let classificationId: number

    beforeAll(async () => {
      const classification = await payload.create({
        collection: 'codeClassifications',
        data: { code: uniqueLetters('grpcls'), name: 'Group format test classification' },
        overrideAccess: true,
      })
      classificationId = classification.id
    })

    it('rejects a codeId that is not uppercase snake_case', async () => {
      await expect(
        payload.create({
          collection: 'codeGroups',
          data: {
            codeId: uniqueLetters('bad').toLowerCase(),
            name: 'Bad group',
            classification: classificationId,
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects an empty-string codeId', async () => {
      await expect(
        payload.create({
          collection: 'codeGroups',
          data: { codeId: '', name: 'Empty group', classification: classificationId },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('accepts a valid uppercase snake_case codeId', async () => {
      const codeId = uniqueLetters('valid').toUpperCase()
      const created = await payload.create({
        collection: 'codeGroups',
        data: { codeId, name: 'Valid group', classification: classificationId },
        overrideAccess: true,
      })
      expect(created.codeId).toBe(codeId)
    })
  })

  describe('codes (detail codes)', () => {
    let groupAId: number
    let groupBId: number
    let groupATopCodeId: number

    beforeAll(async () => {
      const classification = await payload.create({
        collection: 'codeClassifications',
        data: { code: uniqueLetters('dcls'), name: 'Detail code test classification' },
        overrideAccess: true,
      })

      const groupA = await payload.create({
        collection: 'codeGroups',
        data: {
          codeId: uniqueLetters('grpa').toUpperCase(),
          name: 'Group A',
          classification: classification.id,
        },
        overrideAccess: true,
      })
      groupAId = groupA.id

      const groupB = await payload.create({
        collection: 'codeGroups',
        data: {
          codeId: uniqueLetters('grpb').toUpperCase(),
          name: 'Group B',
          classification: classification.id,
        },
        overrideAccess: true,
      })
      groupBId = groupB.id

      const topCode = await payload.create({
        collection: 'codes',
        data: { group: groupAId, code: '01', name: 'Top level A' },
        overrideAccess: true,
      })
      groupATopCodeId = topCode.id
    })

    it('computes depth 1 for a top-level code', async () => {
      const doc = await payload.findByID({
        collection: 'codes',
        id: groupATopCodeId,
        overrideAccess: true,
      })
      expect(doc.depth).toBe(1)
    })

    it('rejects a code with the wrong digit length for its depth', async () => {
      await expect(
        payload.create({
          collection: 'codes',
          data: { group: groupAId, code: '001', name: 'Bad length' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects a non-digit code', async () => {
      await expect(
        payload.create({
          collection: 'codes',
          data: { group: groupAId, code: 'ab', name: 'Bad chars' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects a duplicate (group, code) pair', async () => {
      await expect(
        payload.create({
          collection: 'codes',
          data: { group: groupAId, code: '01', name: 'Duplicate top level A' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('allows the same code value in a different group (uniqueness is per-group, not global)', async () => {
      const created = await payload.create({
        collection: 'codes',
        data: { group: groupBId, code: '01', name: 'Top level B' },
        overrideAccess: true,
      })
      expect(created.code).toBe('01')
      expect(created.depth).toBe(1)
    })

    it('creates a valid depth-2 child code and computes its depth', async () => {
      const child = await payload.create({
        collection: 'codes',
        data: { group: groupAId, parent: groupATopCodeId, code: '0101', name: 'Child A' },
        overrideAccess: true,
      })
      expect(child.depth).toBe(2)
    })

    it('rejects a child code that does not start with its parent code', async () => {
      await expect(
        payload.create({
          collection: 'codes',
          data: {
            group: groupAId,
            parent: groupATopCodeId,
            code: '0299',
            name: 'Bad prefix child',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects a parent from a different code group', async () => {
      await expect(
        payload.create({
          collection: 'codes',
          data: {
            group: groupBId,
            parent: groupATopCodeId,
            code: '0101',
            name: 'Cross group child',
          },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('rejects a code set as its own parent', async () => {
      const soloCode = await payload.create({
        collection: 'codes',
        data: { group: groupAId, code: '05', name: 'Solo' },
        overrideAccess: true,
      })

      await expect(
        payload.update({
          collection: 'codes',
          id: soloCode.id,
          data: { parent: soloCode.id, code: '0505' },
          overrideAccess: true,
        }),
      ).rejects.toThrow()
    })

    it('DB backstop: concurrent creates for the same (group, code) — exactly one wins, the other gets a clean error, not a raw 500', async () => {
      // The `beforeValidate` hook's `find`-based duplicate check (see
      // Codes.ts) is racy by construction: two concurrent requests can both
      // pass that lookup before either has committed its insert. This test
      // fires two real concurrent `create`s for the same (group, code) to
      // exercise that race against the actual DB — the composite unique
      // index (`indexes: [{ fields: ['group', 'code'], unique: true }]` in
      // Codes.ts) is what must catch whichever one the app-level lookup
      // doesn't. Whichever layer wins, the loser must surface as a clean
      // 400-status validation-style error (Payload's generic Postgres
      // unique-constraint handler converts a raw `23505` into a
      // `ValidationError`), never an unhandled 500.
      const attempt = () =>
        payload.create({
          collection: 'codes',
          data: { group: groupAId, code: '09', name: 'Concurrent race' },
          overrideAccess: true,
        })

      const [first, second] = await Promise.allSettled([attempt(), attempt()])
      const results = [first, second]

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')

      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)

      const reason = (rejected[0] as PromiseRejectedResult).reason as {
        message?: unknown
        status?: unknown
      }
      // A raw, unhandled driver/DB error would not carry Payload's
      // `status` field at all (or would carry 500) — assert it's a clean
      // 400 rather than asserting on message text, which differs between
      // the two possible catching layers (app-level "already exists" vs.
      // the DB-backstop's "Value must be unique").
      expect(reason.status).toBe(400)
    })
  })

  describe('baseline code seed', () => {
    it('seeds the SYS classification/groups/codes idempotently', async () => {
      // Run twice — the second run must find everything already created
      // and skip, rather than erroring on unique constraints.
      await runSeed(payload, [codesStep])
      await runSeed(payload, [codesStep])

      const classifications = await payload.find({
        collection: 'codeClassifications',
        where: { code: { equals: SEED_CLASSIFICATION.code } },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      expect(classifications.docs).toHaveLength(1)
      expect(classifications.docs[0]?.name).toBe(SEED_CLASSIFICATION.name)

      for (const groupDef of SEED_CODE_GROUPS) {
        const groups = await payload.find({
          collection: 'codeGroups',
          where: { codeId: { equals: groupDef.codeId } },
          limit: 1,
          pagination: false,
          overrideAccess: true,
        })
        expect(groups.docs).toHaveLength(1)
        const groupId = groups.docs[0]?.id
        expect(groupId).toBeDefined()

        const codes = await payload.find({
          collection: 'codes',
          where: { group: { equals: groupId } },
          limit: 20,
          pagination: false,
          overrideAccess: true,
        })
        expect(codes.docs).toHaveLength(groupDef.codes.length)

        for (const codeDef of groupDef.codes) {
          const match = codes.docs.find((doc) => doc.code === codeDef.code)
          expect(match).toBeDefined()
          expect(match?.name).toBe(codeDef.name)
          expect(match?.depth).toBe(1)
          if ('legacyValue' in codeDef) {
            expect(match?.legacyValue).toBe(codeDef.legacyValue)
          }
        }
      }
    })
  })
})
