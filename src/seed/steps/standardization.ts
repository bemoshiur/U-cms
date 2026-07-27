import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * MOIS (행정안전부) baseline preload for the standardization dictionaries
 * (Phase 8, Task 8.1a; refs 1-60/1-62/1-64). Seeds a SMALL, representative set
 * of enacted MOIS standard domains + words + terms — enough that each dictionary
 * list renders non-empty and looks like the manual's screens (금액N17, 연월일C8,
 * LVABSN_END_YMD, …), NOT the thousands the real MOIS standard carries. Every
 * seeded row is `standardSource: 'mois'`, `approvalStatus: 'approved'`,
 * `enacted: true` (baseline / read-only — see the enacted lock in
 * `lockStandard.ts`). This also feeds the rich demo (the CMS must not look
 * empty).
 *
 * Idempotent: each row is looked up by its natural unique key
 * (domainName / abbreviation / termAbbreviation) before create — safe to re-run.
 * Runs after `standardizationRolesStep` (no hard data dependency, but grouped
 * with the module's seed) — the three collections always exist by boot time.
 *
 * NOTE on the 1-74 code sets: the three code groups the code specification /
 * proposal workflow rely on — APRV_CD (Y/I/N), ACS_VLD_USE_CD (AVU001-004),
 * BBS_ITEM_TYPE_CD (text/date/email) — are ALREADY seeded by `codesStep`
 * (src/seed/steps/codes.ts). Nothing to add here; the code-spec report reads
 * them directly.
 */

const APPROVED_AT = '2025-02-12T00:00:00.000Z'
const APPROVER_ID = 'admin'

type DomainSeed = {
  domainGroup: string
  classification: string
  domainName: string
  dataType: 'NUMERIC' | 'CHAR' | 'VARCHAR' | 'TEXT'
  dataLength?: number
  decimalPlaces?: number
  storageFormat?: string
  displayFormat?: string
  unitName?: string
  allowedValues?: string
  revision: string
  description?: string
}

/** ~14 MOIS baseline domains (ref 1-60 observed values + the domains terms bind to). */
export const MOIS_DOMAINS: DomainSeed[] = [
  {
    domainGroup: '금액',
    classification: '금액',
    domainName: '금액N17',
    dataType: 'NUMERIC',
    dataLength: 17,
    storageFormat: '99,999,999,999,999,900',
    displayFormat: '99,999,999,999,999,900',
    unitName: '원/KRW',
    revision: '6차',
    description: '금액 (Amount), NUMERIC 17.',
  },
  {
    domainGroup: '금액',
    classification: '금액',
    domainName: '금액N18',
    dataType: 'NUMERIC',
    dataLength: 18,
    storageFormat: '999,999,999,999,999,900',
    displayFormat: '999,999,999,999,999,900',
    unitName: '원/KRW',
    revision: '6차',
    description: '금액 (Amount), NUMERIC 18.',
  },
  {
    domainGroup: '금액',
    classification: '금액',
    domainName: '금액22.2',
    dataType: 'NUMERIC',
    dataLength: 22,
    decimalPlaces: 2,
    storageFormat: '9,999,999,999,999,999,999.99',
    unitName: '원/KRW',
    revision: '6차',
    description: '금액 (Amount), NUMERIC precision 22 scale 2.',
  },
  {
    domainGroup: '금액',
    classification: '비용',
    domainName: '비용N15',
    dataType: 'NUMERIC',
    dataLength: 15,
    storageFormat: '999,999,999,999,900',
    unitName: '원/KRW',
    revision: '6차',
    description: '비용 (Cost), NUMERIC 15.',
  },
  {
    domainGroup: '금액',
    classification: '요금',
    domainName: '요금N15',
    dataType: 'NUMERIC',
    dataLength: 15,
    storageFormat: '999,999,999,999,900',
    unitName: '원/KRW',
    revision: '6차',
    description: '요금 (Fee), NUMERIC 15.',
  },
  {
    domainGroup: '날짜/시간',
    classification: '시분',
    domainName: '시분C4',
    dataType: 'CHAR',
    dataLength: 4,
    storageFormat: 'HH24MI',
    displayFormat: 'HH24MI',
    allowedValues: 'HH : 00-23, MI : 00-59',
    revision: '6차',
    description: '시분 (Hour-Minute), CHAR 4.',
  },
  {
    domainGroup: '날짜/시간',
    classification: '시분초',
    domainName: '시분초C6',
    dataType: 'CHAR',
    dataLength: 6,
    storageFormat: 'HH24MISS',
    displayFormat: 'HH24MISS',
    allowedValues: 'HH : 00-23, MI : 00-59, SS : 00-59',
    revision: '6차',
    description: '시분초 (Hour-Minute-Second), CHAR 6.',
  },
  {
    domainGroup: '날짜/시간',
    classification: '연도',
    domainName: '연도C4',
    dataType: 'CHAR',
    dataLength: 4,
    storageFormat: 'YYYY',
    displayFormat: 'YYYY',
    allowedValues: 'YYYY : 0001-9999',
    revision: '6차',
    description: '연도 (Year), CHAR 4.',
  },
  {
    domainGroup: '날짜/시간',
    classification: '연월',
    domainName: '연월C6',
    dataType: 'CHAR',
    dataLength: 6,
    storageFormat: 'YYYYMM',
    displayFormat: 'YYYYMM',
    allowedValues: 'YYYY : 0001-9999, MM : 01-12',
    revision: '6차',
    description: '연월 (Year-Month), CHAR 6.',
  },
  {
    domainGroup: '날짜/시간',
    classification: '연월일',
    domainName: '연월일C8',
    dataType: 'CHAR',
    dataLength: 8,
    storageFormat: 'YYYYMMDD',
    displayFormat: 'YYYYMMDD',
    allowedValues: 'YYYY : 0001-9999, MM : 01-12, DD : 01-31',
    revision: '6차',
    description: '연월일 (Date), CHAR 8.',
  },
  {
    domainGroup: '여부',
    classification: '여부',
    domainName: '여부C1',
    dataType: 'CHAR',
    dataLength: 1,
    storageFormat: 'Y or N',
    displayFormat: 'Y or N',
    allowedValues: 'Y : 예, N : 아니오',
    revision: '6차',
    description: '여부 (Yes/No flag), CHAR 1.',
  },
  {
    domainGroup: '수',
    classification: '수',
    domainName: '수N7',
    dataType: 'NUMERIC',
    dataLength: 7,
    storageFormat: '9999999',
    displayFormat: '9999999',
    revision: '6차',
    description: '수 (Count/Number), NUMERIC 7.',
  },
  {
    domainGroup: '내용',
    classification: '내용',
    domainName: '내용V4000',
    dataType: 'VARCHAR',
    dataLength: 4000,
    revision: '6차',
    description: '내용 (Content), VARCHAR 4000.',
  },
  {
    domainGroup: '명',
    classification: '명',
    domainName: '명V100',
    dataType: 'VARCHAR',
    dataLength: 100,
    revision: '6차',
    description: '명 (Name), VARCHAR 100.',
  },
]

type WordSeed = {
  abbreviation: string
  koreanName: string
  englishName: string
  isFormalWord?: boolean
  domainClassification?: string
  synonyms?: string
  revision: string
  description?: string
}

/** ~14 MOIS baseline words (ref 1-62). */
export const MOIS_WORDS: WordSeed[] = [
  {
    abbreviation: 'MBRCO',
    koreanName: '회원사',
    englishName: 'Member Company',
    revision: '6차',
    description: '어떤 회를 구성하는 회사 또는 어떤 단체에 가입한 회사.',
  },
  {
    abbreviation: 'YMD',
    koreanName: '연월일',
    englishName: 'Date',
    domainClassification: '연월일',
    revision: '6차',
  },
  {
    abbreviation: 'YN',
    koreanName: '여부',
    englishName: 'Yes or No',
    domainClassification: '여부',
    revision: '6차',
  },
  {
    abbreviation: 'AMT',
    koreanName: '금액',
    englishName: 'Amount',
    domainClassification: '금액',
    revision: '6차',
  },
  {
    abbreviation: 'CNT',
    koreanName: '수',
    englishName: 'Count',
    domainClassification: '수',
    revision: '6차',
  },
  {
    abbreviation: 'NM',
    koreanName: '명',
    englishName: 'Name',
    domainClassification: '명',
    revision: '6차',
  },
  {
    abbreviation: 'CD',
    koreanName: '코드',
    englishName: 'Code',
    domainClassification: '코드',
    revision: '6차',
  },
  {
    abbreviation: 'CN',
    koreanName: '내용',
    englishName: 'Content',
    domainClassification: '내용',
    revision: '6차',
  },
  {
    abbreviation: 'LVABSN',
    koreanName: '휴직',
    englishName: 'Leave of Absence',
    isFormalWord: true,
    revision: '6차',
  },
  {
    abbreviation: 'SCBIZ',
    koreanName: '휴폐업',
    englishName: 'Close Business',
    isFormalWord: true,
    revision: '6차',
  },
  {
    abbreviation: 'SMK',
    koreanName: '흡연',
    englishName: 'Smoking',
    isFormalWord: true,
    revision: '6차',
  },
  {
    abbreviation: 'BGNG',
    koreanName: '시작',
    englishName: 'Begin',
    isFormalWord: true,
    revision: '6차',
  },
  {
    abbreviation: 'END',
    koreanName: '종료',
    englishName: 'End',
    isFormalWord: true,
    revision: '6차',
  },
  {
    abbreviation: 'DAY',
    koreanName: '일',
    englishName: 'Day',
    isFormalWord: true,
    revision: '6차',
  },
]

type TermSeed = {
  termAbbreviation: string
  termName: string
  boundDomainName: string
  revision: string
  termDescription?: string
}

/** ~10 MOIS baseline terms (ref 1-64). Each binds to a seeded domain by name. */
export const MOIS_TERMS: TermSeed[] = [
  {
    termAbbreviation: 'LVABSN_END_YMD',
    termName: '휴직종료일자',
    boundDomainName: '연월일C8',
    revision: '6차',
    termDescription: '일정 기간 직무를 쉬는 것을 끝마치는 날짜.',
  },
  {
    termAbbreviation: 'LVABSN_BGNG_YMD',
    termName: '휴직시작일자',
    boundDomainName: '연월일C8',
    revision: '6차',
    termDescription: '휴직을 시작하는 날짜.',
  },
  {
    termAbbreviation: 'LVABSN_YMD',
    termName: '휴직일자',
    boundDomainName: '연월일C8',
    revision: '6차',
  },
  {
    termAbbreviation: 'LVABSN_DAY_CNT',
    termName: '휴직일수',
    boundDomainName: '수N7',
    revision: '6차',
  },
  {
    termAbbreviation: 'LVABSN_YN',
    termName: '휴직여부',
    boundDomainName: '여부C1',
    revision: '6차',
  },
  {
    termAbbreviation: 'SCBIZ_YMD',
    termName: '휴폐업일자',
    boundDomainName: '연월일C8',
    revision: '6차',
  },
  {
    termAbbreviation: 'SCBIZ_YN',
    termName: '휴폐업여부',
    boundDomainName: '여부C1',
    revision: '6차',
  },
  { termAbbreviation: 'SMK_YN', termName: '흡연여부', boundDomainName: '여부C1', revision: '6차' },
  { termAbbreviation: 'TEST_YN', termName: '시설여부', boundDomainName: '여부C1', revision: '6차' },
]

async function findOrCreateDomain(payload: Payload, d: DomainSeed): Promise<number> {
  const existing = await payload.find({
    collection: 'standardDomains',
    where: { domainName: { equals: d.domainName } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs[0]) {
    payload.logger.info(
      `[seed:standardization] domain "${d.domainName}" already exists — skipping.`,
    )
    return existing.docs[0].id
  }
  const created = await payload.create({
    collection: 'standardDomains',
    data: {
      standardSource: 'mois',
      revision: d.revision,
      domainGroup: d.domainGroup,
      classification: d.classification,
      domainName: d.domainName,
      dataType: d.dataType,
      dataLength: d.dataLength,
      decimalPlaces: d.decimalPlaces,
      storageFormat: d.storageFormat,
      displayFormat: d.displayFormat,
      unitName: d.unitName,
      description: d.description,
      allowedValues: d.allowedValues,
      useStatus: 'used',
      approvalStatus: 'approved',
      approvedAt: APPROVED_AT,
      approverId: APPROVER_ID,
      enacted: true,
    },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:standardization] created domain "${d.domainName}".`)
  return created.id
}

async function findOrCreateWord(payload: Payload, w: WordSeed): Promise<void> {
  const existing = await payload.find({
    collection: 'standardWords',
    where: { abbreviation: { equals: w.abbreviation } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    payload.logger.info(
      `[seed:standardization] word "${w.abbreviation}" already exists — skipping.`,
    )
    return
  }
  await payload.create({
    collection: 'standardWords',
    data: {
      standardSource: 'mois',
      revision: w.revision,
      abbreviation: w.abbreviation,
      koreanName: w.koreanName,
      englishName: w.englishName,
      isFormalWord: w.isFormalWord ?? false,
      domainClassification: w.domainClassification,
      synonyms: w.synonyms,
      description: w.description,
      useStatus: 'used',
      approvalStatus: 'approved',
      approvedAt: APPROVED_AT,
      approverId: APPROVER_ID,
      enacted: true,
    },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:standardization] created word "${w.abbreviation}".`)
}

async function findOrCreateTerm(
  payload: Payload,
  t: TermSeed,
  domainIdByName: Map<string, number>,
): Promise<void> {
  const existing = await payload.find({
    collection: 'standardTerms',
    where: { termAbbreviation: { equals: t.termAbbreviation } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    payload.logger.info(
      `[seed:standardization] term "${t.termAbbreviation}" already exists — skipping.`,
    )
    return
  }
  const domain = MOIS_DOMAINS.find((d) => d.domainName === t.boundDomainName)
  await payload.create({
    collection: 'standardTerms',
    data: {
      standardSource: 'mois',
      revision: t.revision,
      termAbbreviation: t.termAbbreviation,
      termName: t.termName,
      boundDomain: domainIdByName.get(t.boundDomainName),
      allowedValues: domain?.allowedValues,
      storageFormat: domain?.storageFormat,
      displayFormat: domain?.displayFormat,
      termDescription: t.termDescription,
      useStatus: 'used',
      approvalStatus: 'approved',
      approvedAt: APPROVED_AT,
      approverId: APPROVER_ID,
      enacted: true,
    },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:standardization] created term "${t.termAbbreviation}".`)
}

export const standardizationPreloadStep: SeedStep = {
  name: 'standardization-preload',
  async run(payload) {
    const domainIdByName = new Map<string, number>()
    for (const d of MOIS_DOMAINS) {
      domainIdByName.set(d.domainName, await findOrCreateDomain(payload, d))
    }
    for (const w of MOIS_WORDS) {
      await findOrCreateWord(payload, w)
    }
    for (const t of MOIS_TERMS) {
      await findOrCreateTerm(payload, t, domainIdByName)
    }
  },
}
