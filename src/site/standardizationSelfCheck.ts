import type { Payload, PayloadRequest } from 'payload'

import { SELF_CHECK_HISTORICAL_BYPASS } from '../standardization/constants'
import type { RuleId } from '../standardization/rules'
import { currentYearMonth } from '../standardization/yearMonth'
import { inspectSchema, type InspectionRow } from './standardizationIntrospection'

/**
 * Self-check "Run Check" engine (Phase 8, Task 8.1b; ref 1-75, callout 9).
 * Re-runs the live-schema introspection for each standard source, then (over)-
 * writes the CURRENT check year-month snapshot with the eight error counts +
 * denormalized detail rows. Earlier months are reference-only, so this ONLY ever
 * touches the current YM (the collection's `enforceCurrentYearMonthOnly` guard
 * permits current-YM writes without a bypass).
 */

const DETAIL_CAP = 5000

/** The sources a self-check evaluates (excluded/unassigned tables aren't checked). */
export const SELF_CHECK_SOURCES = ['mois', 'institution'] as const
export type SelfCheckSource = (typeof SELF_CHECK_SOURCES)[number]

/** One denormalized violating-column detail row (for the 1-75 detail popup). */
export type SelfCheckDetail = {
  tableName: string
  columnName: string
  logicalName: string
  dataType: string
  domain: string
  errorTypes: RuleId[]
}

/** The table names assigned a given standard source (ref 1-67 governs the scope). */
async function assignedTableNames(
  payload: Payload,
  source: string,
  req?: PayloadRequest,
): Promise<string[]> {
  const res = await payload.find({
    collection: 'tableStandardSettings',
    where: { standardSource: { equals: source } },
    limit: 100000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return res.docs.map((d) => String(d.tableName ?? '')).filter(Boolean)
}

function toDetails(rows: InspectionRow[]): SelfCheckDetail[] {
  const details: SelfCheckDetail[] = []
  for (const r of rows) {
    const errorTypes = (Object.keys(r.fails) as RuleId[]).filter((k) => r.fails[k])
    if (errorTypes.length === 0) continue
    details.push({
      tableName: r.tableName,
      columnName: r.columnName,
      logicalName: r.logicalName,
      dataType: r.dataType,
      domain: r.domain,
      errorTypes,
    })
    if (details.length >= DETAIL_CAP) break
  }
  return details
}

export type SelfCheckRunSnapshot = {
  checkYearMonth: string
  standardSource: string
  counts: Record<RuleId, number>
  detailCount: number
}

/**
 * Runs the self-check for one source against the live schema and upserts the
 * current-YM snapshot. Returns the resulting counts.
 */
export async function runSelfCheckForSource(
  payload: Payload,
  source: SelfCheckSource,
  req?: PayloadRequest,
): Promise<SelfCheckRunSnapshot> {
  const ym = currentYearMonth()
  const onlyTables = await assignedTableNames(payload, source, req)
  const { rows, counts } = await inspectSchema(payload, { source, onlyTables, req })
  const details = toDetails(rows)

  const data = {
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
    checkedAt: new Date().toISOString(),
    details,
  }

  const existing = await payload.find({
    collection: 'standardizationSelfChecks',
    where: { and: [{ checkYearMonth: { equals: ym } }, { standardSource: { equals: source } }] },
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })

  if (existing.docs[0]) {
    await payload.update({
      collection: 'standardizationSelfChecks',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
      req,
    })
  } else {
    await payload.create({
      collection: 'standardizationSelfChecks',
      data,
      overrideAccess: true,
      req,
    })
  }

  return { checkYearMonth: ym, standardSource: source, counts, detailCount: details.length }
}

/** Runs the self-check for every checked source (mois + institution). */
export async function runSelfCheckAllSources(
  payload: Payload,
  req?: PayloadRequest,
): Promise<SelfCheckRunSnapshot[]> {
  const out: SelfCheckRunSnapshot[] = []
  for (const source of SELF_CHECK_SOURCES) {
    out.push(await runSelfCheckForSource(payload, source, req))
  }
  return out
}

/** Re-exported so the seed can reference the historical-write bypass symbol. */
export { SELF_CHECK_HISTORICAL_BYPASS }
