import type { Payload, PayloadRequest } from 'payload'

import { STD_CODE_SPEC_MENU_KEY } from '../standardization/constants'

/**
 * Code Specification report (코드 명세서) data layer — feature-inventory ref 1-74
 * (Phase 8, Task 8.1a). A READ-ONLY inventory over the EXISTING common-code
 * collections (`codeClassifications` → `codeGroups` → `codes`), NOT a new
 * collection. Shows 분류 / 구분 / 코드ID / 상위코드 / 코드 / 코드명 / 코드영문명 / 등록일,
 * filterable by classification + keyword, exportable to CSV. DBA-gated
 * (`standardization.codeSpec`) — the manual describes it as a DBA/audit menu.
 *
 * The report + its CSV export share THIS loader, so the on-screen table and the
 * downloaded file are always identical (mirrors `accessHistoryData.ts`).
 *
 * The rebuild's `codes` store the legacy value (Y/I/N, AVU001…) in `legacyValue`
 * and the depth-based value (01/0101…) in `code`; the report's 코드 column prefers
 * `legacyValue` so it reads like the manual (AVU001, Y, I, N, text…). 상위코드 is
 * the parent's displayed value, or "0" for a root code (matching the manual).
 */

export { STD_CODE_SPEC_MENU_KEY }

/** One row of the code specification report. */
export type CodeSpecRow = {
  classification: string
  codeGroupName: string
  codeId: string
  parentCode: string
  code: string
  codeName: string
  englishName: string
  registeredAt: string
}

/** A classification option for the filter dropdown. */
export type CodeSpecClassification = { code: string; name: string }

export type CodeSpecResult = {
  rows: CodeSpecRow[]
  classifications: CodeSpecClassification[]
  total: number
}

export type CodeSpecQuery = {
  /** Filter by `codeClassifications.code` (the dropdown value), or all. */
  classification?: string
  /** Case-insensitive keyword across classification / group / codeId / code / codeName. */
  keyword?: string
}

type Ref = number | string | { id?: number | string } | null | undefined

function refId(value: Ref): number | string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'object') {
    return value.id
  }
  return value
}

/** The displayed code value: legacy value if present (manual parity), else the depth code. */
function displayCode(code: { legacyValue?: string | null; code?: string | null }): string {
  return (code.legacyValue && code.legacyValue.length > 0 ? code.legacyValue : code.code) ?? ''
}

/**
 * Assembles the code specification rows. Reads with `overrideAccess` because the
 * caller (the endpoint / the admin view) has already gated on
 * `standardization.codeSpec`. Data volume is small (hundreds of codes), so the
 * classification/keyword filters are applied in-memory after a bounded fetch.
 */
export async function loadCodeSpec(
  payload: Payload,
  args: { query?: CodeSpecQuery; req?: PayloadRequest } = {},
): Promise<CodeSpecResult> {
  const { query = {}, req } = args
  const common = { pagination: false as const, depth: 0 as const, overrideAccess: true, req }

  const classificationsRes = await payload.find({
    collection: 'codeClassifications',
    limit: 1000,
    sort: 'code',
    ...common,
  })
  const classifications: CodeSpecClassification[] = classificationsRes.docs.map((c) => ({
    code: String(c.code),
    name: String(c.name),
  }))
  const classificationById = new Map<number | string, { code: string; name: string }>()
  for (const c of classificationsRes.docs) {
    classificationById.set(c.id, { code: String(c.code), name: String(c.name) })
  }

  // Optionally restrict to one classification (by its `code`).
  const selectedClassificationId =
    query.classification && query.classification.length > 0
      ? classificationsRes.docs.find((c) => String(c.code) === query.classification)?.id
      : undefined

  const groupsRes = await payload.find({
    collection: 'codeGroups',
    limit: 5000,
    ...common,
    ...(selectedClassificationId !== undefined
      ? { where: { classification: { equals: selectedClassificationId } } }
      : {}),
  })
  const groupById = new Map<
    number | string,
    { codeId: string; name: string; classificationId: number | string | undefined }
  >()
  for (const g of groupsRes.docs) {
    groupById.set(g.id, {
      codeId: String(g.codeId),
      name: String(g.name),
      classificationId: refId(g.classification as Ref),
    })
  }
  const groupIds = groupsRes.docs.map((g) => g.id)

  const codesRes =
    groupIds.length > 0
      ? await payload.find({
          collection: 'codes',
          limit: 20000,
          sort: 'code',
          ...common,
          where: { group: { in: groupIds } },
        })
      : { docs: [] as Array<Record<string, unknown>> }

  // Parent lookup: id -> displayed value (for 상위코드).
  const codeDisplayById = new Map<number | string, string>()
  for (const c of codesRes.docs as Array<Record<string, unknown>>) {
    codeDisplayById.set(
      c.id as number | string,
      displayCode({ legacyValue: c.legacyValue as string | null, code: c.code as string | null }),
    )
  }

  let rows: CodeSpecRow[] = (codesRes.docs as Array<Record<string, unknown>>).map((c) => {
    const group = groupById.get(refId(c.group as Ref) as number | string)
    const classification = group?.classificationId
      ? classificationById.get(group.classificationId)
      : undefined
    const parentId = refId(c.parent as Ref)
    return {
      classification: classification?.name ?? '',
      codeGroupName: group?.name ?? '',
      codeId: group?.codeId ?? '',
      parentCode: parentId !== undefined ? (codeDisplayById.get(parentId) ?? '') : '0',
      code: displayCode({
        legacyValue: c.legacyValue as string | null,
        code: c.code as string | null,
      }),
      codeName: String(c.name ?? ''),
      englishName: '',
      registeredAt:
        typeof c.createdAt === 'string' ? c.createdAt : c.createdAt ? String(c.createdAt) : '',
    }
  })

  const keyword = query.keyword?.trim().toLowerCase()
  if (keyword) {
    rows = rows.filter((r) =>
      [r.classification, r.codeGroupName, r.codeId, r.code, r.codeName]
        .join('')
        .toLowerCase()
        .includes(keyword),
    )
  }

  // Deterministic order: classification → group → code.
  rows.sort(
    (a, b) =>
      a.classification.localeCompare(b.classification) ||
      a.codeGroupName.localeCompare(b.codeGroupName) ||
      a.code.localeCompare(b.code),
  )

  return { rows, classifications, total: rows.length }
}
