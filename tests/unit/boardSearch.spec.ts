import { describe, expect, it } from 'vitest'

import {
  buildPostSearchWhere,
  isTextQueryableFieldKey,
  postColumnForFieldKey,
  searchableFieldKeys,
  textSearchableFieldKeys,
  toPositiveIntId,
} from '@/content/boardSearch'
import type { BoardLike } from '@/content/boardSearch'

const board: BoardLike = {
  fields: [
    { fieldKey: 'title', useFlag: true, searchFlag: true },
    { fieldKey: 'author', useFlag: true, searchFlag: true },
    { fieldKey: 'department', useFlag: true, searchFlag: false }, // not searchable
    { fieldKey: 'registrationDate', useFlag: true, searchFlag: true },
    { fieldKey: 'extraField1', useFlag: false, searchFlag: true }, // not in use
  ],
}

describe('postColumnForFieldKey (Task 3D board search)', () => {
  it('maps the legacy date/number keys and passes others through', () => {
    expect(postColumnForFieldKey('registrationDate')).toBe('createdAt')
    expect(postColumnForFieldKey('modificationDate')).toBe('updatedAt')
    expect(postColumnForFieldKey('number')).toBe('id')
    expect(postColumnForFieldKey('title')).toBe('title')
    expect(postColumnForFieldKey('extraField1')).toBe('extraField1')
  })
})

describe('searchableFieldKeys', () => {
  it('returns only fields with both useFlag and searchFlag', () => {
    expect(searchableFieldKeys(board)).toEqual(['title', 'author', 'registrationDate'])
  })
})

describe('D6 — text-column allowlist (relationship/column-less keys never 500)', () => {
  // A board that (mis)configures a RELATIONSHIP column (department) and a
  // column-less legacy key (division) as searchable — the exact trigger for the
  // Phase-3 boardSearch 500.
  const trickyBoard: BoardLike = {
    fields: [
      { fieldKey: 'title', useFlag: true, searchFlag: true },
      { fieldKey: 'department', useFlag: true, searchFlag: true }, // relationship
      { fieldKey: 'division', useFlag: true, searchFlag: true }, // no posts column
      { fieldKey: 'number', useFlag: true, searchFlag: true }, // id (non-text)
    ],
  }

  it('isTextQueryableFieldKey accepts real text columns and rejects the rest', () => {
    expect(isTextQueryableFieldKey('title')).toBe(true)
    expect(isTextQueryableFieldKey('extraContent4')).toBe(true)
    expect(isTextQueryableFieldKey('department')).toBe(false) // relationship
    expect(isTextQueryableFieldKey('division')).toBe(false) // no column
    expect(isTextQueryableFieldKey('number')).toBe(false) // id
    expect(isTextQueryableFieldKey('registrationDate')).toBe(false) // date
  })

  it('textSearchableFieldKeys drops relationship / column-less searchable keys', () => {
    // searchableFieldKeys still reports every flagged key…
    expect(searchableFieldKeys(trickyBoard)).toEqual(['title', 'department', 'division', 'number'])
    // …but only `title` is safe to `like`.
    expect(textSearchableFieldKeys(trickyBoard)).toEqual(['title'])
  })

  it('an unscoped keyword only ORs across safe text columns (no department/division/id)', () => {
    const where = buildPostSearchWhere(trickyBoard, 7, { keyword: 'x' })
    const and = (where as { and: unknown[] }).and
    const orClause = and.find((c) => (c as { or?: unknown }).or) as { or: unknown[] }
    expect(orClause.or).toEqual([{ title: { like: 'x' } }])
  })

  it('a keyword scoped to a searchable-but-relationship field yields no like clause', () => {
    const where = buildPostSearchWhere(trickyBoard, 7, { keyword: 'x', field: 'department' })
    // department is searchable per config but not text-queryable → ignored (no 500).
    expect(where).toEqual({ board: { equals: 7 } })
  })

  it('a keyword scoped to a column-less legacy key (division) yields no like clause', () => {
    const where = buildPostSearchWhere(trickyBoard, 7, { keyword: 'x', field: 'division' })
    expect(where).toEqual({ board: { equals: 7 } })
  })
})

describe('buildPostSearchWhere', () => {
  it('always constrains to the board', () => {
    const where = buildPostSearchWhere(board, 42)
    expect(where).toEqual({ board: { equals: 42 } })
  })

  it('scopes a keyword to a searchable field', () => {
    const where = buildPostSearchWhere(board, 1, { keyword: 'hello', field: 'title' })
    expect(where).toMatchObject({
      and: [{ board: { equals: 1 } }, { title: { like: 'hello' } }],
    })
  })

  it('ignores a keyword scoped to a NON-searchable field (never widens)', () => {
    const where = buildPostSearchWhere(board, 1, { keyword: 'hello', field: 'department' })
    // department is not searchable → no keyword clause added.
    expect(where).toEqual({ board: { equals: 1 } })
  })

  it('ORs an unscoped keyword across text-searchable fields (excludes dates)', () => {
    const where = buildPostSearchWhere(board, 1, { keyword: 'hello' })
    const and = (where as { and: unknown[] }).and
    const orClause = and.find((c) => (c as { or?: unknown }).or) as { or: unknown[] }
    expect(orClause.or).toEqual([{ title: { like: 'hello' } }, { author: { like: 'hello' } }])
  })

  it('adds category and period criteria', () => {
    const where = buildPostSearchWhere(board, 1, {
      category1: 9,
      periodFrom: '2026-01-01',
      periodTo: '2026-12-31',
    })
    const and = (where as { and: unknown[] }).and
    expect(and).toContainEqual({ category1: { equals: 9 } })
    expect(and).toContainEqual({ createdAt: { greater_than_equal: '2026-01-01' } })
    expect(and).toContainEqual({ createdAt: { less_than_equal: '2026-12-31' } })
  })
})

describe('M1 — category filters are coerced to positive integer ids (no NaN 500)', () => {
  it('toPositiveIntId accepts positive ints (and numeric strings), rejects the rest', () => {
    expect(toPositiveIntId(9)).toBe(9)
    expect(toPositiveIntId('9')).toBe(9)
    expect(toPositiveIntId(' 12 ')).toBe(12)
    expect(toPositiveIntId('abc')).toBeUndefined()
    expect(toPositiveIntId('9abc')).toBeUndefined()
    expect(toPositiveIntId('-5')).toBeUndefined()
    expect(toPositiveIntId('9.5')).toBeUndefined()
    expect(toPositiveIntId(-1)).toBeUndefined()
    expect(toPositiveIntId(0)).toBeUndefined()
    expect(toPositiveIntId('')).toBeUndefined()
    expect(toPositiveIntId(null)).toBeUndefined()
  })

  it('a crafted non-numeric category yields NO category clause (no NaN reaches the query)', () => {
    // The exact public-500 trigger: ?category1=abc.
    const where = buildPostSearchWhere(board, 1, { category1: 'abc' as never })
    expect(where).toEqual({ board: { equals: 1 } })

    // Negative / float are likewise dropped.
    expect(buildPostSearchWhere(board, 1, { category2: '-3' as never })).toEqual({
      board: { equals: 1 },
    })
    expect(buildPostSearchWhere(board, 1, { category3: '2.5' as never })).toEqual({
      board: { equals: 1 },
    })
  })

  it('a valid numeric category (string or number) still filters', () => {
    expect(buildPostSearchWhere(board, 1, { category1: '7' })).toMatchObject({
      and: [{ board: { equals: 1 } }, { category1: { equals: 7 } }],
    })
    expect(buildPostSearchWhere(board, 1, { category2: 4 })).toMatchObject({
      and: [{ board: { equals: 1 } }, { category2: { equals: 4 } }],
    })
  })
})
