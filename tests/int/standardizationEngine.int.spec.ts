import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import { runSeed } from '@/seed'
import { adminMenusStep } from '@/seed/steps/adminMenus'
import { rolesStep } from '@/seed/steps/roles'
import { superAdminStep } from '@/seed/steps/superAdmin'
import { standardizationRolesStep } from '@/seed/steps/standardizationRoles'
import { standardizationPreloadStep } from '@/seed/steps/standardization'
import { standardizationEngineStep } from '@/seed/steps/standardizationEngine'
import {
  SELF_CHECK_HISTORICAL_BYPASS,
  STANDARDIZATION_BYPASS_LOCK,
  STANDARDIZATION_MENU_KEYS,
  STD_META_INSPECTION_MENU_KEY,
} from '@/standardization/constants'
import { applyProposalOnApprove } from '@/collections/standardization/proposalApply'
import { currentYearMonth } from '@/standardization/yearMonth'
import {
  handleMetaInspection,
  handleRunSelfCheck,
  handleSelfCheckList,
  handleSelfCheckStats,
} from '@/endpoints/standardizationEngineExport'
import {
  batchApplyTableSource,
  handleBatchApply,
  handleTableSettings,
  handleTableSettingsExport,
} from '@/endpoints/tableStandardEndpoints'

let payload: Payload

function unique(label: string): string {
  return `${label}${Date.now()}${Math.floor(Math.random() * 10000)}`
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

async function makeGranted(...keys: string[]): Promise<Record<string, unknown>> {
  const grants: number[] = []
  for (const k of keys) grants.push(await menuId(k))
  const role = await payload.create({
    collection: 'roles',
    data: {
      roleId: `ROLE_TEST_${unique('G').toUpperCase()}`,
      name: 'grant',
      description: 'x',
      menuGrants: grants,
    },
    overrideAccess: true,
  })
  return payload.create({
    collection: 'users',
    data: {
      email: `${unique('eng')}@example.com`,
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
      email: `${unique('none')}@example.com`,
      password: TEST_PASSWORD,
      roles: [],
      status: 'active',
    } as never,
    overrideAccess: true,
  }) as unknown as Promise<Record<string, unknown>>
}

describe('Task 8.1b — standardization engine (proposals, inspection, self-check, statistics)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await runSeed(payload, [
      adminMenusStep,
      rolesStep,
      superAdminStep,
      standardizationRolesStep,
      standardizationPreloadStep,
      standardizationEngineStep,
    ])
  })

  // ── Part 1: DBA proposal workflow ──────────────────────────────────────────
  describe('proposal approve APPLIES to the dictionary (DBA-gated, logged, idempotent)', () => {
    it('a roleless admin cannot read or process proposals', async () => {
      const roleless = await makeRoleless()
      await expect(
        payload.find({
          collection: 'standardizationProposals',
          user: roleless,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })

    it('approving a REGISTER proposal creates the dictionary entry exactly once', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const domainName = unique('ENGDOM').toUpperCase()
      const proposal = await payload.create({
        collection: 'standardizationProposals',
        data: {
          target: 'domain',
          proposalKind: 'register',
          standardSource: 'institution',
          proposedName: domainName,
          proposedPayload: {
            domainGroup: '테스트',
            classification: '테스트',
            domainName,
            dataType: 'VARCHAR',
            dataLength: 20,
            useStatus: 'used',
          },
          approvalStatus: 'pending',
        } as never,
        overrideAccess: true,
      })

      // Approve as the DBA (real gate exercised: overrideAccess false).
      await payload.update({
        collection: 'standardizationProposals',
        id: proposal.id,
        data: { approvalStatus: 'approved' } as never,
        user: dba,
        overrideAccess: false,
      })

      const created = await payload.find({
        collection: 'standardDomains',
        where: { domainName: { equals: domainName } },
        pagination: false,
        overrideAccess: true,
      })
      expect(created.docs).toHaveLength(1)
      expect(created.docs[0]!.enacted).toBeFalsy()

      const applied = await payload.findByID({
        collection: 'standardizationProposals',
        id: proposal.id,
        overrideAccess: true,
      })
      expect((applied as { appliedEntryId?: number }).appliedEntryId).toBe(created.docs[0]!.id)

      // Idempotent: re-saving an already-approved proposal does NOT re-apply.
      await payload.update({
        collection: 'standardizationProposals',
        id: proposal.id,
        data: { approvalStatus: 'approved', processingMemo: 'again' } as never,
        user: dba,
        overrideAccess: false,
      })
      const afterReapprove = await payload.count({
        collection: 'standardDomains',
        where: { domainName: { equals: domainName } },
        overrideAccess: true,
      })
      expect(afterReapprove.totalDocs).toBe(1)

      // Logged via the audit backbone (accessLogs) under the proposals menuKey.
      const logs = await payload.count({
        collection: 'accessLogs',
        where: {
          and: [
            { menuKey: { equals: 'standardization.proposals' } },
            { action: { equals: 'update' } },
          ],
        },
        overrideAccess: true,
      })
      expect(logs.totalDocs).toBeGreaterThanOrEqual(1)
    })

    it('the enacted-lock bypass is cleared after the apply (never left on req.context)', async () => {
      // Fix-loop round 1, Important #1: prove the bypass flag does not leak past
      // the single apply. Drive the hook directly with a req whose context we own.
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const domainName = unique('LEAKDOM').toUpperCase()
      const req = { payload, user: dba, context: {} } as unknown as PayloadRequest
      const data: Record<string, unknown> = {
        target: 'domain',
        proposalKind: 'register',
        standardSource: 'institution',
        proposedName: domainName,
        proposedPayload: {
          domainGroup: 'x',
          classification: 'x',
          domainName,
          dataType: 'CHAR',
          useStatus: 'used',
        },
        approvalStatus: 'approved',
      }
      await applyProposalOnApprove({
        data,
        originalDoc: { approvalStatus: 'pending' },
        operation: 'update',
        req,
        context: req.context,
        collection: { slug: 'standardizationProposals' },
      } as never)

      // Bypass flag re-closed on the request context.
      expect((req.context as Record<string, unknown>)[STANDARDIZATION_BYPASS_LOCK]).toBeFalsy()
      // The apply actually happened (proves the flag WAS set during the write).
      expect((data as { appliedEntryId?: number }).appliedEntryId).toBeGreaterThan(0)
    })

    it('an approved proposal with proposedPayload.enacted:true does NOT create an enacted entry', async () => {
      // Fix-loop round 1, Minor #1: the SYSTEM controls `enacted`, never the payload.
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const domainName = unique('NOENACT').toUpperCase()
      const proposal = await payload.create({
        collection: 'standardizationProposals',
        data: {
          target: 'domain',
          proposalKind: 'register',
          standardSource: 'institution',
          proposedName: domainName,
          proposedPayload: {
            domainGroup: 'x',
            classification: 'x',
            domainName,
            dataType: 'CHAR',
            useStatus: 'used',
            enacted: true, // hostile payload — must be stripped on apply.
          },
          approvalStatus: 'pending',
        } as never,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'standardizationProposals',
        id: proposal.id,
        data: { approvalStatus: 'approved' } as never,
        user: dba,
        overrideAccess: false,
      })
      const created = await payload.find({
        collection: 'standardDomains',
        where: { domainName: { equals: domainName } },
        pagination: false,
        overrideAccess: true,
      })
      expect(created.docs).toHaveLength(1)
      expect(created.docs[0]!.enacted).toBeFalsy()
    })

    it('approving an EDIT proposal against an ENACTED term applies via the bypass-lock seam', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const abbr = unique('ENGTERM').toUpperCase()
      const enactedTerm = await payload.create({
        collection: 'standardTerms',
        data: {
          standardSource: 'mois',
          termAbbreviation: abbr,
          termName: '원래이름',
          useStatus: 'used',
          enacted: true,
        } as never,
        overrideAccess: true,
      })

      // Sanity: the enacted lock blocks a DIRECT update (proves the seam is needed).
      await expect(
        payload.update({
          collection: 'standardTerms',
          id: enactedTerm.id,
          data: { termName: 'direct-tamper' } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      const proposal = await payload.create({
        collection: 'standardizationProposals',
        data: {
          target: 'term',
          proposalKind: 'edit',
          standardSource: 'mois',
          proposedName: abbr,
          targetEntryId: enactedTerm.id,
          proposedPayload: { termName: '수정된이름' },
          approvalStatus: 'pending',
        } as never,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'standardizationProposals',
        id: proposal.id,
        data: { approvalStatus: 'approved' } as never,
        user: dba,
        overrideAccess: false,
      })

      const updated = await payload.findByID({
        collection: 'standardTerms',
        id: enactedTerm.id,
        overrideAccess: true,
      })
      expect((updated as { termName?: string }).termName).toBe('수정된이름')
    })
  })

  // ── Part 2: Table standard settings ────────────────────────────────────────
  describe('table standard settings (list + batch apply + CSV injection guard)', () => {
    it('batch-apply assigns a source to selected tables and is DBA-gated', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const tableName = unique('tbl_').toLowerCase()

      const roleless = await makeRoleless()
      const denied = await handleBatchApply({
        payload,
        req: { user: roleless, payload } as unknown as PayloadRequest,
        body: { tableNames: [tableName], standardSource: 'excluded' },
      })
      expect(denied.status).toBe(403)

      const res = await handleBatchApply({
        payload,
        req: { user: dba, payload } as unknown as PayloadRequest,
        body: { tableNames: [tableName], standardSource: 'excluded' },
      })
      expect(res.status).toBe(200)
      const found = await payload.find({
        collection: 'tableStandardSettings',
        where: { tableName: { equals: tableName } },
        pagination: false,
        overrideAccess: true,
      })
      expect(found.docs[0]!.standardSource).toBe('excluded')
    })

    it('the tables list + summary is DBA-gated and reflects assignments', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const resp = await handleTableSettings({
        payload,
        req: { user: dba, payload } as unknown as PayloadRequest,
      })
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as {
        tableSettings: { summary: { total: number; mois: number }; rows: unknown[] }
      }
      expect(body.tableSettings.summary.total).toBeGreaterThan(0)
      expect(body.tableSettings.summary.mois).toBeGreaterThan(0)

      const roleless = await makeRoleless()
      const denied = await handleTableSettings({
        payload,
        req: { user: roleless, payload } as unknown as PayloadRequest,
      })
      expect(denied.status).toBe(403)
    })

    it('CSV export neutralizes formula injection in a table description', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const tableName = unique('tbl_inj_').toLowerCase()
      await payload.create({
        collection: 'tableStandardSettings',
        data: { tableName, tableDescription: '=SUM(99)', standardSource: 'mois' } as never,
        overrideAccess: true,
      })
      const resp = await handleTableSettingsExport({
        payload,
        req: { user: dba, payload } as unknown as PayloadRequest,
        searchParams: new URLSearchParams(`keyword=${tableName}`),
      })
      expect(resp.status).toBe(200)
      const csv = await resp.text()
      expect(csv).toContain(`"'=SUM(99)"`)
      expect(csv).not.toContain(',=SUM(99)')
    })

    it('batchApplyTableSource rejects an invalid source', async () => {
      await expect(
        batchApplyTableSource(payload, { tableNames: ['x'], standardSource: 'bogus' }),
      ).rejects.toThrow()
    })
  })

  // ── Part 3: Meta inspection (1-66) ─────────────────────────────────────────
  describe('meta-term inspection (four rules, live schema)', () => {
    it('returns a four-verdict grid and is DBA-gated', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const resp = await handleMetaInspection({
        payload,
        req: { user: dba, payload } as unknown as PayloadRequest,
      })
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as {
        metaInspection: { counts: { label: string }[]; rows: { verdicts: unknown[] }[] }
      }
      expect(body.metaInspection.counts).toHaveLength(4)
      // Real payload tables use English snake_case columns absent from the MOIS
      // word dictionary, so 오류3 (column-token) FAILs are present.
      const err3 = body.metaInspection.counts.find((c) => c.label === '오류3')!
      expect(err3).toBeDefined()

      const roleless = await makeRoleless()
      const denied = await handleMetaInspection({
        payload,
        req: { user: roleless, payload } as unknown as PayloadRequest,
      })
      expect(denied.status).toBe(403)
    })

    it('a table-settings grant alone does NOT unlock meta inspection', async () => {
      const wrong = await makeGranted('standardization.tableSettings')
      const denied = await handleMetaInspection({
        payload,
        req: { user: wrong, payload } as unknown as PayloadRequest,
      })
      expect(denied.status).toBe(403)
      expect(STD_META_INSPECTION_MENU_KEY).toBe('standardization.metaInspection')
    })
  })

  // ── Part 4: Self-check (1-75) + statistics (1-76) ──────────────────────────
  describe('self-check run + current-YM-only write + statistics', () => {
    it('Run Check writes the CURRENT year-month snapshot for each source', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const resp = await handleRunSelfCheck({
        payload,
        req: { user: dba, payload } as unknown as PayloadRequest,
      })
      expect(resp.status).toBe(200)
      const body = (await resp.json()) as { snapshots: { checkYearMonth: string }[] }
      expect(body.snapshots.length).toBe(2)
      expect(body.snapshots.every((s) => s.checkYearMonth === currentYearMonth())).toBe(true)

      const persisted = await payload.count({
        collection: 'standardizationSelfChecks',
        where: {
          and: [
            { checkYearMonth: { equals: currentYearMonth() } },
            { standardSource: { equals: 'mois' } },
          ],
        },
        overrideAccess: true,
      })
      expect(persisted.totalDocs).toBe(1)
    })

    it('only the current year-month is writable; historical needs the bypass', async () => {
      // Clean any prior run of this exact fixture (persistent dev DB).
      const pastYm = '201503'
      const prior = await payload.find({
        collection: 'standardizationSelfChecks',
        where: {
          and: [{ checkYearMonth: { equals: pastYm } }, { standardSource: { equals: 'mois' } }],
        },
        pagination: false,
        overrideAccess: true,
      })
      for (const d of prior.docs) {
        await payload.delete({
          collection: 'standardizationSelfChecks',
          id: d.id,
          overrideAccess: true,
        })
      }

      // A past-YM write WITHOUT the bypass is rejected by the guard.
      await expect(
        payload.create({
          collection: 'standardizationSelfChecks',
          data: { checkYearMonth: pastYm, standardSource: 'mois' } as never,
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      // With the historical bypass (as the seed uses) it succeeds.
      const ok = await payload.create({
        collection: 'standardizationSelfChecks',
        data: { checkYearMonth: pastYm, standardSource: 'mois' } as never,
        context: { [SELF_CHECK_HISTORICAL_BYPASS]: true },
        overrideAccess: true,
      })
      expect(ok.checkYearMonth).toBe(pastYm)
    })

    it('self-check list + statistics are gated and non-empty', async () => {
      const dba = await makeGranted(...STANDARDIZATION_MENU_KEYS)
      const listResp = await handleSelfCheckList({
        payload,
        req: { user: dba, payload } as unknown as PayloadRequest,
      })
      expect(listResp.status).toBe(200)
      const listBody = (await listResp.json()) as { selfCheck: { snapshots: unknown[] } }
      expect(listBody.selfCheck.snapshots.length).toBeGreaterThan(0)

      const statsResp = await handleSelfCheckStats({
        payload,
        req: { user: dba, payload } as unknown as PayloadRequest,
      })
      expect(statsResp.status).toBe(200)
      const statsBody = (await statsResp.json()) as {
        stats: { pie: unknown[]; grandTotal: number; trend: { months: string[] } }
      }
      expect(statsBody.stats.pie).toHaveLength(8)
      expect(statsBody.stats.grandTotal).toBeGreaterThan(0)

      const roleless = await makeRoleless()
      expect(
        (
          await handleSelfCheckStats({
            payload,
            req: { user: roleless, payload } as unknown as PayloadRequest,
          })
        ).status,
      ).toBe(403)
      expect(
        (
          await handleSelfCheckList({
            payload,
            req: { user: roleless, payload } as unknown as PayloadRequest,
          })
        ).status,
      ).toBe(403)
    })
  })

  // ── Part 5: seed idempotency ───────────────────────────────────────────────
  describe('engine seed is idempotent', () => {
    it('re-running the engine seed creates no duplicates', async () => {
      const count = async (collection: string) =>
        (await payload.count({ collection: collection as never, overrideAccess: true })).totalDocs
      const before = {
        p: await count('standardizationProposals'),
        t: await count('tableStandardSettings'),
        s: await count('standardizationSelfChecks'),
      }
      await runSeed(payload, [standardizationEngineStep])
      const after = {
        p: await count('standardizationProposals'),
        t: await count('tableStandardSettings'),
        s: await count('standardizationSelfChecks'),
      }
      expect(after).toEqual(before)
    })
  })
})
