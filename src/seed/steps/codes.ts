import type { Payload } from 'payload'

import type { SeedStep } from '../types'

/**
 * Baseline code sets from the legacy code specification (ref 1-74) that
 * Pulse CMS's own code needs right away. Kept as typed constants so tests
 * assert against the same source of truth rather than duplicating literals
 * (mirrors `SEED_SITES` in `src/seed/steps/sites.ts`).
 *
 * Legacy used letter/string values directly (Y/I/N, AVU001-004) instead of
 * a depth-based hierarchy; `legacyValue` preserves those for audit parity
 * while `code` follows the 2-digit-per-depth rule the rebuild's `codes`
 * collection enforces. `BBS_ITEM_TYPE_CD`'s legacy values (`text`/`date`/
 * `email`) are identical to the new `name`, so no separate `legacyValue` is
 * recorded for that group.
 */
export const SEED_CLASSIFICATION = {
  code: 'SYS',
  name: 'System codes',
  description:
    'Baseline system-level codes for Pulse CMS (accessibility validation, approval workflow, board field types). See docs/analysis/feature-inventory.md ref 1-74.',
} as const

export const SEED_CODE_GROUPS = [
  {
    codeId: 'APRV_CD',
    name: 'Approval status',
    description: 'Legacy 승인코드 (approval status code). Ref 1-74.',
    codes: [
      { code: '01', name: 'Approved (승인)', legacyValue: 'Y' },
      { code: '02', name: 'Pending approval (승인대기)', legacyValue: 'I' },
      { code: '03', name: 'Not approved (미승인)', legacyValue: 'N' },
    ],
  },
  {
    codeId: 'ACS_VLD_USE_CD',
    name: 'Accessibility validation usage',
    description: 'Legacy 웹접근성검사사용코드 (web accessibility check usage code). Ref 1-74.',
    codes: [
      { code: '01', name: 'off', legacyValue: 'AVU001' },
      { code: '02', name: 'popup', legacyValue: 'AVU002' },
      { code: '03', name: 'db', legacyValue: 'AVU003' },
      { code: '04', name: 'popup_db', legacyValue: 'AVU004' },
    ],
  },
  {
    codeId: 'BBS_ITEM_TYPE_CD',
    name: 'Board field item types',
    description: 'Legacy 게시판항목타입코드 (board item type code). Ref 1-74.',
    codes: [
      { code: '01', name: 'text' },
      { code: '02', name: 'date' },
      { code: '03', name: 'email' },
    ],
  },
] as const

async function findOrCreateClassification(payload: Payload): Promise<number> {
  const existing = await payload.find({
    collection: 'codeClassifications',
    where: { code: { equals: SEED_CLASSIFICATION.code } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })

  if (existing.docs[0]) {
    payload.logger.info(
      `[seed:codes] classification "${SEED_CLASSIFICATION.code}" already exists — skipping.`,
    )
    return existing.docs[0].id
  }

  const created = await payload.create({
    collection: 'codeClassifications',
    data: SEED_CLASSIFICATION,
    overrideAccess: true,
  })
  payload.logger.info(`[seed:codes] created classification "${SEED_CLASSIFICATION.code}".`)
  return created.id
}

async function findOrCreateGroup(
  payload: Payload,
  groupDef: (typeof SEED_CODE_GROUPS)[number],
  classificationId: number,
): Promise<number> {
  const existing = await payload.find({
    collection: 'codeGroups',
    where: { codeId: { equals: groupDef.codeId } },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })

  if (existing.docs[0]) {
    payload.logger.info(`[seed:codes] code group "${groupDef.codeId}" already exists — skipping.`)
    return existing.docs[0].id
  }

  const created = await payload.create({
    collection: 'codeGroups',
    data: {
      codeId: groupDef.codeId,
      name: groupDef.name,
      description: groupDef.description,
      classification: classificationId,
    },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:codes] created code group "${groupDef.codeId}".`)
  return created.id
}

async function findOrCreateCode(
  payload: Payload,
  groupId: number,
  groupCodeId: string,
  codeDef: { code: string; name: string; legacyValue?: string },
  order: number,
): Promise<void> {
  const existing = await payload.find({
    collection: 'codes',
    where: {
      and: [{ group: { equals: groupId } }, { code: { equals: codeDef.code } }],
    },
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    payload.logger.info(
      `[seed:codes] code "${groupCodeId}.${codeDef.code}" already exists — skipping.`,
    )
    return
  }

  await payload.create({
    collection: 'codes',
    data: {
      group: groupId,
      code: codeDef.code,
      name: codeDef.name,
      legacyValue: codeDef.legacyValue,
      order,
    },
    overrideAccess: true,
  })
  payload.logger.info(`[seed:codes] created code "${groupCodeId}.${codeDef.code}".`)
}

/**
 * Seeds the baseline `SYS` classification, its three code groups, and each
 * group's flat (depth-1) detail codes — TODO 1.19 / ref 1-74. Must run
 * after `sitesStep` (see `src/seed/index.ts`), though it has no direct data
 * dependency on sites; ordering follows the brief.
 *
 * Idempotent: every level (classification / group / code) is looked up by
 * its natural unique key before create — safe to re-run.
 */
export const codesStep: SeedStep = {
  name: 'codes',
  async run(payload) {
    const classificationId = await findOrCreateClassification(payload)

    for (const groupDef of SEED_CODE_GROUPS) {
      const groupId = await findOrCreateGroup(payload, groupDef, classificationId)

      for (const [index, codeDef] of groupDef.codes.entries()) {
        await findOrCreateCode(payload, groupId, groupDef.codeId, codeDef, index)
      }
    }
  },
}
