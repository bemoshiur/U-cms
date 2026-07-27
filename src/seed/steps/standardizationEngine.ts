import type { Payload } from 'payload'

import { SELF_CHECK_HISTORICAL_BYPASS } from '../../standardization/constants'
import type { RuleId } from '../../standardization/rules'
import { currentYearMonth } from '../../standardization/yearMonth'
import { introspectTableNames } from '../../site/standardizationIntrospection'
import type { SeedStep } from '../types'

/**
 * Standardization ENGINE demo seed (Phase 8, Task 8.1b). Layers a small,
 * idempotent demo ON TOP of 8.1a's dictionaries so the proposal queue (1-68..
 * 1-73), table standard settings (1-67), self-check results (1-75) and
 * statistics (1-76) all render non-empty like the manual:
 *
 *  - a table-standard assignment for every LIVE physical table (most → MOIS, a
 *    couple → institution / excluded / unassigned so the summary strip looks
 *    like the manual);
 *  - a couple of PENDING proposals (register / edit / discard);
 *  - three PRIOR-month self-check snapshots per source (reference-only history —
 *    written via the historical-write bypass, since the guard only permits the
 *    current YM through the normal path).
 *
 * Idempotent throughout (find-by-natural-key before create). Runs after
 * `standardizationPreloadStep` (needs the seeded MOIS dictionaries to target
 * edit/discard proposals).
 */

/** The N year-months immediately preceding `ym` (YYYYMM), newest first. */
function priorYearMonths(ym: string, n: number): string[] {
  let y = Number(ym.slice(0, 4))
  let m = Number(ym.slice(4))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
    out.push(`${y}${String(m).padStart(2, '0')}`)
  }
  return out
}

/** Deterministic pseudo-count so the demo history has a plausible downward trend. */
function demoCounts(seed: number): Record<RuleId, number> {
  const base = (mult: number) => Math.max(0, Math.round(mult * (1 + (seed % 3))))
  return {
    error1: base(1),
    error2: 0,
    error3: base(40),
    error4: base(8),
    error5: base(2),
    error6: 0,
    error7: base(3),
    error8: base(1),
  }
}

async function seedTableSettings(payload: Payload): Promise<void> {
  const tables = await introspectTableNames(payload)
  // Assign a couple of specific tables to non-MOIS sources for the summary strip;
  // everything else defaults to MOIS. Deterministic, matches the manual's mix.
  const institutionTable = tables.find((t) => t === 'standard_words') ?? tables[1]
  const excludedTable = tables.find((t) => t === 'payload_migrations') ?? undefined
  const unassignedTable = tables.find((t) => t === 'payload_preferences') ?? undefined

  for (const tableName of tables) {
    const existing = await payload.find({
      collection: 'tableStandardSettings',
      where: { tableName: { equals: tableName } },
      limit: 1,
      pagination: false,
      overrideAccess: true,
    })
    if (existing.docs.length > 0) continue
    let standardSource = 'mois'
    if (tableName === institutionTable) standardSource = 'institution'
    else if (tableName === excludedTable) standardSource = 'excluded'
    else if (tableName === unassignedTable) standardSource = 'unassigned'
    await payload.create({
      collection: 'tableStandardSettings',
      data: {
        tableName,
        tableCategory: '기본',
        tableDescription: '',
        standardSource,
      } as never,
      overrideAccess: true,
    })
  }
  payload.logger.info(
    `[seed:standardization-engine] table settings ensured for ${tables.length} tables.`,
  )
}

async function findDictId(
  payload: Payload,
  collection: 'standardTerms' | 'standardWords' | 'standardDomains',
  field: string,
  value: string,
): Promise<number | undefined> {
  const res = await payload.find({
    collection,
    where: { [field]: { equals: value } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return res.docs[0]?.id as number | undefined
}

async function ensureProposal(
  payload: Payload,
  proposal: Record<string, unknown> & {
    target: string
    proposalKind: string
    proposedName: string
  },
): Promise<void> {
  const existing = await payload.find({
    collection: 'standardizationProposals',
    where: {
      and: [
        { target: { equals: proposal.target } },
        { proposalKind: { equals: proposal.proposalKind } },
        { proposedName: { equals: proposal.proposedName } },
      ],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) return
  await payload.create({
    collection: 'standardizationProposals',
    data: proposal as never,
    overrideAccess: true,
  })
  payload.logger.info(
    `[seed:standardization-engine] created ${proposal.proposalKind} proposal "${proposal.proposedName}".`,
  )
}

async function seedProposals(payload: Payload): Promise<void> {
  // 1. Register proposal — a new institution domain (전화번호V14).
  await ensureProposal(payload, {
    target: 'domain',
    proposalKind: 'register',
    standardSource: 'institution',
    revision: '기관생성',
    proposedName: '전화번호V14',
    proposedPayload: {
      domainGroup: '번호',
      classification: '전화번호',
      domainName: '전화번호V14',
      dataType: 'VARCHAR',
      dataLength: 14,
      useStatus: 'used',
      description: '전화번호 (Phone number), VARCHAR 14.',
    },
    proposedAt: '2026-06-05T02:11:00.000Z',
    approvalStatus: 'pending',
  })

  // 2. Edit proposal — change the seeded MOIS term TEST_YN's name (pending review).
  const testYnId = await findDictId(payload, 'standardTerms', 'termAbbreviation', 'TEST_YN')
  if (testYnId !== undefined) {
    await ensureProposal(payload, {
      target: 'term',
      proposalKind: 'edit',
      standardSource: 'mois',
      revision: '6차',
      proposedName: 'TEST_YN',
      targetEntryId: testYnId,
      proposedPayload: { termName: '시험여부' },
      proposedAt: '2026-06-06T05:59:00.000Z',
      approvalStatus: 'pending',
    })
  }

  // 3. Discard proposal — retire a seeded MOIS word (SMK / 흡연), pending review.
  const smkId = await findDictId(payload, 'standardWords', 'abbreviation', 'SMK')
  if (smkId !== undefined) {
    await ensureProposal(payload, {
      target: 'word',
      proposalKind: 'discard',
      standardSource: 'mois',
      revision: '6차',
      proposedName: 'SMK',
      targetEntryId: smkId,
      proposedAt: '2026-06-07T08:00:00.000Z',
      approvalStatus: 'pending',
    })
  }
}

async function seedHistoricalSelfChecks(payload: Payload): Promise<void> {
  const months = priorYearMonths(currentYearMonth(), 3) // newest-first: 3 prior months
  const sources = ['mois', 'institution'] as const
  let idx = 0
  for (const source of sources) {
    for (const ym of months) {
      idx += 1
      const existing = await payload.find({
        collection: 'standardizationSelfChecks',
        where: {
          and: [{ checkYearMonth: { equals: ym } }, { standardSource: { equals: source } }],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      })
      if (existing.docs.length > 0) continue
      const counts = demoCounts(idx + Number(ym.slice(4)))
      await payload.create({
        collection: 'standardizationSelfChecks',
        data: {
          checkYearMonth: ym,
          standardSource: source,
          error1Count: counts.error1,
          error2Count: counts.error2,
          error3Count: counts.error3,
          error4Count: counts.error4,
          error5Count: counts.error5,
          error6Count: counts.error6,
          error7Count: counts.error7,
          error8Count: counts.error8,
          checkedAt: `${ym.slice(0, 4)}-${ym.slice(4)}-28T02:00:00.000Z`,
          details: [
            {
              tableName: 'ta_acs_cntrl_authrt',
              columnName: 'authrt_sn',
              logicalName: '권한-일련번호',
              dataType: 'NUMERIC(22)',
              domain: '일련번호N10',
              errorTypes: ['error1'],
            },
          ],
          note: '참고용 (reference-only history)',
        },
        // Historical months are reference-only; the guard permits them only via
        // this bypass. The current-YM row is written live by the Run-Check action.
        context: { [SELF_CHECK_HISTORICAL_BYPASS]: true },
        overrideAccess: true,
      })
    }
  }
  payload.logger.info(`[seed:standardization-engine] historical self-check snapshots ensured.`)
}

export const standardizationEngineStep: SeedStep = {
  name: 'standardization-engine',
  async run(payload) {
    await seedTableSettings(payload)
    await seedProposals(payload)
    await seedHistoricalSelfChecks(payload)
  },
}
