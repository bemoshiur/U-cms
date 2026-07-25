import type { Payload, PayloadRequest, SelectField } from 'payload'

/**
 * Shared constants + helpers for the board configuration engine (Task 3A).
 * Kept in one module so the collections, the seed steps, and the integration
 * tests all assert against the same source of truth (mirrors how
 * `src/seed/steps/codes.ts` exports `SEED_CODE_GROUPS`).
 *
 * This is the foundation for Task 3B (`posts`) and Phase 4 (public
 * rendering): the field-grid defaults below (`BOARD_DEFAULT_FIELDS`) are the
 * canonical description of every column a post can carry, and Task 3B derives
 * the `posts` schema from them — see the mapping note in `Boards.ts` and the
 * Task 3A report.
 */

/** The six built-in board `kind`s (ref 1-77/1-78; drives post behavior in Task 3B). */
export const BOARD_TYPE_KINDS = [
  'integrated',
  'photo',
  'qna',
  'faq',
  'attachment',
  'extended',
] as const

export type BoardTypeKind = (typeof BOARD_TYPE_KINDS)[number]

/**
 * The integrated board's fixed type code. An `isIntegrated` board is locked
 * to this board type + the common skin (ref 1-27/1-28) — enforced in
 * `Boards.ts`'s `beforeValidate` hook.
 */
export const INTEGRATED_BOARD_TYPE_CODE = 'PG0001'

/** `boardTypes.code` pattern — `PG` + zero-padded sequence, e.g. `PG0001`. */
export const BOARD_TYPE_CODE_PREFIX = 'PG'
export const BOARD_TYPE_CODE_PAD = 4

/** `boards.bbsId` pattern — `B` + 7-digit sequence, e.g. `B0000031` (ref 1-27). */
export const BBS_ID_PREFIX = 'B'
export const BBS_ID_PAD = 7

/** HTML input element a post field renders as (ref 1-30's per-field Type selector). */
export const FIELD_INPUT_TYPES = ['text', 'textarea', 'date', 'email', 'select', 'number'] as const

export type FieldInputType = (typeof FIELD_INPUT_TYPES)[number]

/** The five per-field / per-category behavioral flags (ref 1-29, 1-30). */
export type FieldFlags = {
  useFlag: boolean
  requiredFlag: boolean
  listFlag: boolean
  detailFlag: boolean
  searchFlag: boolean
}

/** One row of the field-settings grid (ref 1-30). */
export type BoardFieldConfig = {
  fieldKey: string
  label: string
  htmlTitleAttr: string
  attributeValue: string
  style: string
  inputType: FieldInputType
  /**
   * Storage class this field maps to on the `posts` collection (Task 3B):
   *  - `builtin`   → a first-class, named `posts` column (title, author, …).
   *  - `varchar`   → `extraField1-4`, legacy varchar(4000) columns.
   *  - `text`      → `extraContent1-4`, legacy unbounded text columns.
   * Informational here (nothing on `boards` reads it) — it exists so Task 3B
   * can build the `posts` schema straight from these defaults.
   */
  storage: 'builtin' | 'varchar' | 'text'
} & FieldFlags

const NO_FLAGS: FieldFlags = {
  useFlag: false,
  requiredFlag: false,
  listFlag: false,
  detailFlag: false,
  searchFlag: false,
}

function field(
  fieldKey: string,
  label: string,
  inputType: FieldInputType,
  storage: BoardFieldConfig['storage'],
  flags: Partial<FieldFlags>,
): BoardFieldConfig {
  return {
    fieldKey,
    label,
    htmlTitleAttr: '',
    attributeValue: '',
    style: '',
    inputType,
    storage,
    ...NO_FLAGS,
    ...flags,
  }
}

/**
 * The default field-settings grid seeded onto every new board (ref 1-30).
 * Order here is the natural field order; the *display* order is governed
 * independently by `listFieldOrder` / `detailFieldOrder`.
 *
 * Built-ins map to named `posts` columns; `extraField1-4` map to
 * varchar(4000) columns and `extraContent1-4` to text columns (legacy fixed
 * types — ref 1-30). The main rich body/content is NOT in this grid: it is a
 * core post field (Editor/HTML/TEXT) handled directly in Task 3B (plan §2.3),
 * not an admin-toggleable column. Extra fields ship disabled (`useFlag:
 * false`) so admins opt them in per board.
 */
export const BOARD_DEFAULT_FIELDS: BoardFieldConfig[] = [
  field('number', 'Number', 'number', 'builtin', { useFlag: true, listFlag: true }),
  field('title', 'Title', 'text', 'builtin', {
    useFlag: true,
    requiredFlag: true,
    listFlag: true,
    detailFlag: true,
    searchFlag: true,
  }),
  field('division', 'Division', 'text', 'builtin', { useFlag: true, listFlag: true }),
  field('department', 'Department', 'text', 'builtin', {
    useFlag: true,
    listFlag: true,
    detailFlag: true,
  }),
  field('author', 'Author', 'text', 'builtin', {
    useFlag: true,
    listFlag: true,
    detailFlag: true,
    searchFlag: true,
  }),
  field('viewCount', 'View Count', 'number', 'builtin', {
    useFlag: true,
    listFlag: true,
    detailFlag: true,
  }),
  field('registrationDate', 'Registration Date', 'date', 'builtin', {
    useFlag: true,
    listFlag: true,
    detailFlag: true,
    searchFlag: true,
  }),
  field('modificationDate', 'Modification Date', 'date', 'builtin', {
    useFlag: true,
    detailFlag: true,
  }),
  field('extraField1', 'Extra Field 1', 'text', 'varchar', {}),
  field('extraField2', 'Extra Field 2', 'text', 'varchar', {}),
  field('extraField3', 'Extra Field 3', 'text', 'varchar', {}),
  field('extraField4', 'Extra Field 4', 'text', 'varchar', {}),
  field('extraContent1', 'Extra Content 1', 'textarea', 'text', {}),
  field('extraContent2', 'Extra Content 2', 'textarea', 'text', {}),
  field('extraContent3', 'Extra Content 3', 'textarea', 'text', {}),
  field('extraContent4', 'Extra Content 4', 'textarea', 'text', {}),
]

/** Sensible default column order for the LIST view (ref 1-31). */
export const DEFAULT_LIST_FIELD_ORDER = [
  'number',
  'title',
  'department',
  'author',
  'registrationDate',
]

/** Sensible default field order for the DETAIL view (ref 1-32). */
export const DEFAULT_DETAIL_FIELD_ORDER = [
  'title',
  'department',
  'author',
  'registrationDate',
  'viewCount',
]

/** Shared `options` for a five-flag checkbox group is inlined in the collections. */
export function selectOptions(values: readonly string[]): SelectField['options'] {
  return values.map((value) => ({ label: value, value }))
}

/**
 * Generates the next sequential auto-ID (`PG0001`, `B0000031`, …) for a
 * collection by scanning existing values, taking the numeric max, and
 * incrementing — then zero-padding to `pad` width.
 *
 * RACE-SAFETY (documented, deliberate — mirrors the codes compound-unique
 * pattern in `src/collections/codes/Codes.ts`): this find-max-then-increment
 * is a classic TOCTOU. Two concurrent creates can both read the same max and
 * compute the same next value. That is acceptable *because* the field carries
 * a real Postgres `unique` index (see `code`/`bbsId` field configs): the
 * loser of the race trips the unique constraint (`23505`), which Payload's
 * Postgres adapter converts into a clean `ValidationError` (HTTP 400, "Value
 * must be unique"), never a raw 500. The admin simply retries and gets the
 * next number. This is fine for the low-write admin-console usage these IDs
 * see; a DB sequence would be overkill and wouldn't match the human-readable
 * gap-tolerant legacy scheme (PG0001…PG0004, PG0006, PG0010).
 */
export async function generateNextSequentialId(
  payload: Payload,
  collection: 'boardTypes' | 'boards',
  fieldName: string,
  prefix: string,
  pad: number,
  req: PayloadRequest,
): Promise<string> {
  const existing = await payload.find({
    collection,
    where: { [fieldName]: { like: prefix } },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })

  const pattern = new RegExp(`^${prefix}(\\d+)$`)
  let max = 0
  for (const doc of existing.docs) {
    const value = (doc as unknown as Record<string, unknown>)[fieldName]
    if (typeof value !== 'string') {
      continue
    }
    const match = pattern.exec(value)
    if (match?.[1] !== undefined) {
      const numeric = Number.parseInt(match[1], 10)
      if (Number.isFinite(numeric) && numeric > max) {
        max = numeric
      }
    }
  }

  return `${prefix}${String(max + 1).padStart(pad, '0')}`
}
