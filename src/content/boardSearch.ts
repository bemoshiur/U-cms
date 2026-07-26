import type { Where } from 'payload'

/**
 * Pure board-post search mapping (Task 3D Part 5 / TODO 3.10; refs 1-27..1-35,
 * 2-7). No Payload runtime dependency, so the field-grid → searchable-columns
 * mapping and the multi-criteria `Where` builder are unit-tested in isolation
 * and reused by the export endpoint (and the Phase-4 admin list UI).
 *
 * ## The searchFlag → searchable-field mapping (the documented rule)
 *
 * A board's field grid (`boards.fields[]`, ref 1-30) carries a `searchFlag`
 * per row. The multi-criteria post search (ref 2-7) may only search a field
 * whose row has BOTH `useFlag` (the field is in use) AND `searchFlag` (the
 * field is marked searchable). `searchableFieldKeys(board)` is the single
 * source of truth for that set; `buildPostSearchWhere` refuses any `field`
 * outside it (so a crafted request cannot filter on a non-searchable column).
 *
 * Each searchable board field key maps to a `posts` column via
 * `postColumnForFieldKey`: the legacy "registration/modification date" columns
 * map to Payload's `createdAt`/`updatedAt`, `number` maps to the row `id`, and
 * every other key (`title`, `author`, `department`, `extraField1-4`,
 * `extraContent1-4`, …) maps to the identically-named `posts` column.
 */

/** Minimal board shape the search helpers read (a subset of the real board doc). */
export type BoardFieldRow = {
  fieldKey?: string | null
  useFlag?: boolean | null
  searchFlag?: boolean | null
}

export type BoardLike = {
  fields?: BoardFieldRow[] | null
}

/** Multi-criteria post-search inputs (all optional; ref 2-7). */
export type PostSearchParams = {
  /** Free-text keyword. */
  keyword?: string | null
  /** A specific searchable field key to scope the keyword to (must be searchable). */
  field?: string | null
  /** Classification/category code IDs (the "category + codes" criteria). */
  category1?: string | number | null
  category2?: string | number | null
  category3?: string | number | null
  /** Registration-date period (inclusive). ISO strings or Dates. */
  periodFrom?: string | Date | null
  periodTo?: string | Date | null
}

/** Board field keys that are NOT free-text searchable even if flagged (dates/counters/ids). */
const NON_TEXT_FIELD_KEYS = new Set([
  'number',
  'registrationDate',
  'modificationDate',
  'viewCount',
  'attachment',
])

/**
 * The `posts` columns a `like` keyword filter can SAFELY target — the positive
 * allowlist that fixes D6 (Phase-3 final review). A board admin can mark ANY
 * field-grid row `searchFlag` (ref 1-30), including a `department` (a
 * RELATIONSHIP column — Postgres has no `like` on a join id) or `division` (a
 * legacy grid key with NO matching `posts` column at all). Feeding either into
 * `{ [col]: { like } }` throws at query time → a 500 on the public search /
 * export path. So a keyword `like` clause is emitted ONLY for a field whose
 * MAPPED column is in this set of genuine text columns on `posts`; everything
 * else (relationships, non-existent columns, dates, counters, ids) is treated
 * like a NON_TEXT field and contributes no keyword clause. The set is derived
 * from the real `posts` schema (see `src/collections/posts/Posts.ts`).
 */
const TEXT_QUERYABLE_POST_COLUMNS = new Set([
  'title',
  'author',
  'team',
  'extraField1',
  'extraField2',
  'extraField3',
  'extraField4',
  'extraContent1',
  'extraContent2',
  'extraContent3',
  'extraContent4',
])

/**
 * Coerces a category filter value to a POSITIVE INTEGER id, or `undefined` when
 * it is not one (blank / non-numeric / negative / non-integer). Guards the
 * single-integer `posts.category1-3` relationship columns from a crafted public
 * query param that would otherwise reach Postgres as `NaN` and 500.
 */
export function toPositiveIntId(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') {
      return undefined
    }
    const n = Number(trimmed)
    return Number.isInteger(n) && n > 0 ? n : undefined
  }
  return undefined
}

/** True iff a board field key maps to a real, `like`-queryable text column on `posts`. */
export function isTextQueryableFieldKey(fieldKey: string): boolean {
  if (NON_TEXT_FIELD_KEYS.has(fieldKey)) {
    return false
  }
  return TEXT_QUERYABLE_POST_COLUMNS.has(postColumnForFieldKey(fieldKey))
}

/** Maps a board field key to the `posts` column it filters on. */
export function postColumnForFieldKey(fieldKey: string): string {
  switch (fieldKey) {
    case 'registrationDate':
      return 'createdAt'
    case 'modificationDate':
      return 'updatedAt'
    case 'number':
      return 'id'
    default:
      return fieldKey
  }
}

/** The set of field keys this board allows searching on (useFlag AND searchFlag). */
export function searchableFieldKeys(board: BoardLike): string[] {
  const fields = Array.isArray(board.fields) ? board.fields : []
  const keys: string[] = []
  for (const row of fields) {
    if (row?.useFlag === true && row?.searchFlag === true && typeof row.fieldKey === 'string') {
      keys.push(row.fieldKey)
    }
  }
  return keys
}

/**
 * The free-text (keyword-searchable) subset of the board's searchable fields —
 * ONLY those whose mapped `posts` column is a real, `like`-queryable text
 * column (D6: a relationship like `department` or a column-less legacy key like
 * `division` is excluded here so it can never widen a keyword search into an
 * invalid `like` clause). See {@link isTextQueryableFieldKey}.
 */
export function textSearchableFieldKeys(board: BoardLike): string[] {
  return searchableFieldKeys(board).filter((key) => isTextQueryableFieldKey(key))
}

/**
 * Builds the Payload `Where` for a multi-criteria post search on one board
 * (ref 2-7). Always constrains `board = boardId`. A `keyword` scoped to a
 * `field` is honored only when that field is searchable (else the field
 * criterion is ignored — never widened to an unsearchable column); an
 * unscoped keyword ORs across every text-searchable field. Category IDs and
 * the registration period narrow further. Pure — no DB access.
 */
export function buildPostSearchWhere(
  board: BoardLike,
  boardId: string | number,
  params: PostSearchParams = {},
): Where {
  const and: Where[] = [{ board: { equals: boardId } }]

  const keyword = typeof params.keyword === 'string' ? params.keyword.trim() : ''
  if (keyword.length > 0) {
    const searchable = searchableFieldKeys(board)
    const requestedField =
      typeof params.field === 'string' && params.field.length > 0 ? params.field : undefined

    if (
      requestedField &&
      searchable.includes(requestedField) &&
      isTextQueryableFieldKey(requestedField)
    ) {
      // Only a searchable AND text-queryable field yields a `like` clause (D6):
      // a searchable relationship/column-less key (department/division) is
      // ignored here rather than emitting an invalid `like` that would 500.
      and.push({ [postColumnForFieldKey(requestedField)]: { like: keyword } })
    } else if (!requestedField) {
      const orFields = textSearchableFieldKeys(board)
      if (orFields.length > 0) {
        and.push({
          or: orFields.map((key) => ({ [postColumnForFieldKey(key)]: { like: keyword } })),
        })
      }
    }
    // A requested field that is NOT searchable — or is searchable but not a real
    // text column (D6) — contributes no clause (ignored).
  }

  // Category IDs are single INTEGER relationships (posts.category1-3 → codes). A
  // crafted public `?category1=abc` (or a negative/float) must NOT reach the
  // query — Payload's sanitizeQueryValue has no NaN guard for this branch, so
  // `{ category1: { equals: NaN } }` throws a Postgres integer error → a public
  // 500 (same class as D6, via the category path). Coerce each to a positive
  // integer id and DROP the filter when it is not one.
  const categories: (keyof PostSearchParams)[] = ['category1', 'category2', 'category3']
  for (const key of categories) {
    const id = toPositiveIntId(params[key])
    if (id !== undefined) {
      and.push({ [key]: { equals: id } })
    }
  }

  if (params.periodFrom !== null && params.periodFrom !== undefined && params.periodFrom !== '') {
    and.push({ createdAt: { greater_than_equal: params.periodFrom } })
  }
  if (params.periodTo !== null && params.periodTo !== undefined && params.periodTo !== '') {
    and.push({ createdAt: { less_than_equal: params.periodTo } })
  }

  return and.length === 1 ? and[0]! : { and }
}
