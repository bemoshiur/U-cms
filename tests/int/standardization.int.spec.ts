import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'
import { standardizationRolesStep } from '@/seed/steps/standardizationRoles'
import {
  MOIS_DOMAINS,
  MOIS_TERMS,
  MOIS_WORDS,
  standardizationPreloadStep,
} from '@/seed/steps/standardization'
import {
  ROLE_DBA,
  STANDARDIZATION_BYPASS_LOCK,
  STANDARDIZATION_MENU_KEYS,
  STD_CODE_SPEC_MENU_KEY,
  STD_DOMAINS_MENU_KEY,
} from '@/standardization/constants'
import { handleCodeSpec, handleCodeSpecExport } from '@/endpoints/codeSpecExport'

let payload: Payload

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
}
function uniqueRoleId(label: string): string {
  return `ROLE_TEST_${unique(label).toUpperCase()}`
}
function uniqueEmail(label: string): string {
  return `${unique(label)}@example.com`
}
/** Random English-letters-only string (codeClassifications.code forbids digits). */
function uniqueLetters(n = 12): string {
  let s = ''
  for (let i = 0; i < n; i++) s += String.fromCharCode(97 + Math.floor(Math.random() * 26))
  return s
}
const TEST_PASSWORD = 'a-long-enough-test-password-1'

async function menuId(menuKey: string): Promise<number> {
  const found = await payload.find({
    collection: 'adminMenus',
    where: { menuKey: { equals: menuKey } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0]!.id as number
}

async function makeSuper(): Promise<Record<string, unknown>> {
  const role = await payload.create({
    collection: 'roles',
    data: { roleId: uniqueRoleId('SUP'), name: 'std super', description: 'x', isSuper: true },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('stdsup'),
      password: TEST_PASSWORD,
      roles: [role.id],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function makeGranted(...keys: string[]): Promise<Record<string, unknown>> {
  const grants: number[] = []
  for (const k of keys) grants.push(await menuId(k))
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: uniqueRoleId('GRANT'),
      name: 'grant',
      description: 'x',
      menuGrants: grants,
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('stdgrant'),
      password: TEST_PASSWORD,
      roles: [role.id],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

async function makeRoleless(): Promise<Record<string, unknown>> {
  return payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('stdnone'),
      password: TEST_PASSWORD,
      roles: [],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

describe('Task 8.1a — standardization dictionaries + code-spec report + DBA role', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    // Self-seed dependencies (order-independent, idempotent).
    await runSeed(payload, [
      adminMenusStep,
      rolesStep,
      superAdminStep,
      standardizationRolesStep,
      standardizationPreloadStep,
    ])
  })

  // ── DBA role + menu-gated access ───────────────────────────────────────────
  describe('DBA role + menu-gated collection access', () => {
    it('seeds ROLE_DBA (not isSuper) granting the four standardization menus', async () => {
      const found = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: ROLE_DBA } },
        limit: 1,
        pagination: false,
        depth: 1,
        overrideAccess: true,
      })
      expect(found.docs).toHaveLength(1)
      const role = found.docs[0]!
      expect(role.isSuper).toBeFalsy()
      const grantedKeys = (role.menuGrants ?? []).map((m: unknown) =>
        typeof m === 'object' && m ? (m as { menuKey?: string }).menuKey : undefined,
      )
      for (const key of STANDARDIZATION_MENU_KEYS) {
        expect(grantedKeys).toContain(key)
      }
    })

    it('denies a roleless non-super admin read+create on standardDomains', async () => {
      const roleless = await makeRoleless()
      await expect(
        payload.find({ collection: 'standardDomains', user: roleless, overrideAccess: false }),
      ).rejects.toThrow()
      await expect(
        payload.create({
          collection: 'standardDomains',
          data: {
            standardSource: 'institution',
            domainGroup: 'x',
            classification: 'x',
            domainName: unique('DENY'),
            dataType: 'CHAR',
            useStatus: 'used',
          },
          user: roleless,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('allows a DBA-granted admin to read + register an institution domain', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      await expect(
        payload.find({ collection: 'standardDomains', user: dba, overrideAccess: false }),
      ).resolves.toBeDefined()

      const created = await payload.create({
        collection: 'standardDomains',
        data: {
          standardSource: 'institution',
          domainGroup: '기관그룹',
          classification: '기관분류',
          domainName: unique('INST'),
          dataType: 'VARCHAR',
          dataLength: 50,
          useStatus: 'used',
        },
        user: dba,
        overrideAccess: false,
      })
      expect(created.id).toBeDefined()
      // A DBA registers institution entries only — enacted must stay false
      // (super-only field access silently drops any enacted:true attempt).
      expect(created.enacted).toBeFalsy()
    })

    it('allows a super admin unconditionally', async () => {
      const superUser = await makeSuper()
      await expect(
        payload.find({ collection: 'standardWords', user: superUser, overrideAccess: false }),
      ).resolves.toBeDefined()
      await expect(
        payload.find({ collection: 'standardTerms', user: superUser, overrideAccess: false }),
      ).resolves.toBeDefined()
    })
  })

  // ── Enacted-standard lock (the 8.1b proposal-workflow seam) ─────────────────
  describe('enacted standard entries cannot be edited/deleted directly', () => {
    it('rejects a direct update + delete of an enacted domain, even for super, unless bypassed', async () => {
      const enacted = await payload.create({
        collection: 'standardDomains',
        data: {
          standardSource: 'mois',
          domainGroup: 'g',
          classification: 'c',
          domainName: unique('ENACTED'),
          dataType: 'CHAR',
          useStatus: 'used',
          enacted: true,
        },
        overrideAccess: true,
      })
      const superUser = await makeSuper()

      await expect(
        payload.update({
          collection: 'standardDomains',
          id: enacted.id,
          data: { description: 'tampered' },
          user: superUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
      await expect(
        payload.delete({
          collection: 'standardDomains',
          id: enacted.id,
          user: superUser,
          overrideAccess: false,
        }),
      ).rejects.toThrow()

      // The 8.1b seam: a trusted caller passes the bypass context to apply an
      // approved proposal.
      const bypassed = await payload.update({
        collection: 'standardDomains',
        id: enacted.id,
        data: { description: 'approved change' },
        overrideAccess: true,
        context: { [STANDARDIZATION_BYPASS_LOCK]: true },
      })
      expect(bypassed.description).toBe('approved change')
    })

    it('allows editing + deleting an institution (non-enacted) entry', async () => {
      const inst = await payload.create({
        collection: 'standardWords',
        data: {
          standardSource: 'institution',
          abbreviation: unique('IW').toUpperCase(),
          koreanName: '단어',
          englishName: 'Word',
          useStatus: 'used',
        },
        overrideAccess: true,
      })
      const updated = await payload.update({
        collection: 'standardWords',
        id: inst.id,
        data: { description: 'editable' },
        overrideAccess: true,
      })
      expect(updated.description).toBe('editable')
      await expect(
        payload.delete({ collection: 'standardWords', id: inst.id, overrideAccess: true }),
      ).resolves.toBeDefined()
    })
  })

  // ── MOIS preload + idempotency ─────────────────────────────────────────────
  describe('MOIS baseline preload is idempotent', () => {
    it('re-running the seed steps creates no duplicates', async () => {
      const countDomains = async () =>
        (await payload.count({ collection: 'standardDomains', overrideAccess: true })).totalDocs
      const countWords = async () =>
        (await payload.count({ collection: 'standardWords', overrideAccess: true })).totalDocs
      const countTerms = async () =>
        (await payload.count({ collection: 'standardTerms', overrideAccess: true })).totalDocs

      const before = { d: await countDomains(), w: await countWords(), t: await countTerms() }
      await runSeed(payload, [standardizationRolesStep, standardizationPreloadStep])
      const after = { d: await countDomains(), w: await countWords(), t: await countTerms() }

      expect(after).toEqual(before)

      // Each MOIS natural key resolves to exactly one row.
      const oneDomain = await payload.find({
        collection: 'standardDomains',
        where: { domainName: { equals: MOIS_DOMAINS[0]!.domainName } },
        pagination: false,
        overrideAccess: true,
      })
      expect(oneDomain.docs).toHaveLength(1)

      // ROLE_DBA is not duplicated.
      const roles = await payload.find({
        collection: 'roles',
        where: { roleId: { equals: ROLE_DBA } },
        pagination: false,
        overrideAccess: true,
      })
      expect(roles.docs).toHaveLength(1)
    })

    it('preloaded the representative MOIS set (lists render non-empty)', async () => {
      const moisDomains = await payload.count({
        collection: 'standardDomains',
        where: { and: [{ standardSource: { equals: 'mois' } }, { enacted: { equals: true } }] },
        overrideAccess: true,
      })
      expect(moisDomains.totalDocs).toBeGreaterThanOrEqual(MOIS_DOMAINS.length)
      const moisWords = await payload.count({
        collection: 'standardWords',
        where: { standardSource: { equals: 'mois' } },
        overrideAccess: true,
      })
      expect(moisWords.totalDocs).toBeGreaterThanOrEqual(MOIS_WORDS.length)
      const moisTerms = await payload.count({
        collection: 'standardTerms',
        where: { standardSource: { equals: 'mois' } },
        overrideAccess: true,
      })
      expect(moisTerms.totalDocs).toBeGreaterThanOrEqual(MOIS_TERMS.length)

      // A term is bound to its domain (relationship populated).
      const term = await payload.find({
        collection: 'standardTerms',
        where: { termAbbreviation: { equals: 'LVABSN_END_YMD' } },
        depth: 1,
        pagination: false,
        overrideAccess: true,
      })
      expect(term.docs).toHaveLength(1)
      const bound = term.docs[0]!.boundDomain as { domainName?: string } | number | null
      expect(typeof bound === 'object' && bound ? bound.domainName : undefined).toBe('연월일C8')
    })
  })

  // ── Code Specification report (ref 1-74) + CSV injection guard ──────────────
  describe('code specification report + CSV export', () => {
    it('reports the seeded 1-74 code sets (APRV_CD / ACS_VLD_USE_CD / BBS_ITEM_TYPE_CD)', async () => {
      const dba = await makeGranted(STD_CODE_SPEC_MENU_KEY)
      const req = { user: dba, payload } as unknown as PayloadRequest
      const resp = await handleCodeSpec({ payload, req })
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as {
        codeSpec: { rows: { codeId: string; code: string }[] }
      }
      const ids = new Set(body.codeSpec.rows.map((r) => r.codeId))
      expect(ids.has('APRV_CD')).toBe(true)
      expect(ids.has('ACS_VLD_USE_CD')).toBe(true)
      expect(ids.has('BBS_ITEM_TYPE_CD')).toBe(true)
      // Legacy value shown in the 코드 column (manual parity: Y/I/N, AVU001…).
      const codes = new Set(body.codeSpec.rows.map((r) => r.code))
      expect(codes.has('AVU001')).toBe(true)
    })

    it('gates the report + export (roleless → 403)', async () => {
      const roleless = await makeRoleless()
      const req = { user: roleless, payload } as unknown as PayloadRequest
      expect((await handleCodeSpec({ payload, req })).status).toBe(403)
      expect((await handleCodeSpecExport({ payload, req })).status).toBe(403)
    })

    it('CSV export quotes + neutralizes formula-injection in a code name', async () => {
      // Seed a malicious code name via overrideAccess (bypasses gating).
      const cls = await payload.create({
        collection: 'codeClassifications',
        data: { code: uniqueLetters(), name: 'Injection test' },
        overrideAccess: true,
      })
      const group = await payload.create({
        collection: 'codeGroups',
        data: {
          codeId: `INJ_${Date.now()}`.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
          name: 'Injection group',
          classification: cls.id,
        },
        overrideAccess: true,
      })
      await payload.create({
        collection: 'codes',
        data: { group: group.id, code: '01', name: '=SUM(99)' },
        overrideAccess: true,
      })

      const dba = await makeGranted(STD_CODE_SPEC_MENU_KEY)
      const req = { user: dba, payload } as unknown as PayloadRequest
      const resp = await handleCodeSpecExport({
        payload,
        req,
        searchParams: new URLSearchParams(`classification=${cls.code}`),
      })
      expect(resp.status).toBe(200)
      const csv = await resp.text()
      // The dangerous value is neutralized (leading apostrophe inside quotes),
      // never emitted raw as a formula.
      expect(csv).toContain(`"'=SUM(99)"`)
      expect(csv).not.toContain(',=SUM(99)')
    })
  })

  // ── endpoint access is DBA-gated, independent of codes' own gate ────────────
  describe('code-spec endpoint gate is standardization.codeSpec (not system.codes)', () => {
    it('a standardization.domains-only grant does NOT unlock the code-spec report', async () => {
      const domainsOnly = await makeGranted(STD_DOMAINS_MENU_KEY)
      const req = { user: domainsOnly, payload } as unknown as PayloadRequest
      expect((await handleCodeSpec({ payload, req })).status).toBe(403)
    })
  })
})
