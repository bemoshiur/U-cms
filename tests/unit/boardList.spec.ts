import { describe, expect, it } from 'vitest'

import {
  detailColumns,
  formatPostCell,
  isActiveNotice,
  isNewPost,
  listColumns,
  paginate,
} from '@/content/boardList'
import type { BoardListLike } from '@/content/boardList'

const board: BoardListLike = {
  fields: [
    { fieldKey: 'number', label: 'No.', useFlag: true, listFlag: true, detailFlag: false },
    { fieldKey: 'title', label: 'Title', useFlag: true, listFlag: true, detailFlag: true },
    { fieldKey: 'author', label: 'Writer', useFlag: true, listFlag: true, detailFlag: true },
    // department in-use but NOT list-flagged → excluded from list columns
    { fieldKey: 'department', label: 'Dept', useFlag: true, listFlag: false, detailFlag: true },
    // registrationDate detail-flagged only
    {
      fieldKey: 'registrationDate',
      label: 'Date',
      useFlag: true,
      listFlag: true,
      detailFlag: true,
    },
    // extraField1 flagged but NOT in use → excluded everywhere
    { fieldKey: 'extraField1', label: 'X1', useFlag: false, listFlag: true, detailFlag: true },
  ],
  listFieldOrder: ['number', 'title', 'author', 'department', 'registrationDate', 'extraField1'],
  detailFieldOrder: ['title', 'author', 'department', 'registrationDate', 'extraField1'],
}

describe('listColumns / detailColumns', () => {
  it('projects list columns in listFieldOrder, only in-use + list-flagged, labeled', () => {
    expect(listColumns(board)).toEqual([
      { key: 'number', label: 'No.' },
      { key: 'title', label: 'Title' },
      { key: 'author', label: 'Writer' },
      { key: 'registrationDate', label: 'Date' },
    ])
    // department (not list-flagged) and extraField1 (not in use) are dropped.
  })

  it('projects detail columns independently, only in-use + detail-flagged', () => {
    expect(detailColumns(board)).toEqual([
      { key: 'title', label: 'Title' },
      { key: 'author', label: 'Writer' },
      { key: 'department', label: 'Dept' },
      { key: 'registrationDate', label: 'Date' },
    ])
  })
})

describe('formatPostCell', () => {
  const post = {
    title: 'Hello',
    author: 'Ada',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    department: { name: 'Records' },
    attachments: [{}, {}],
    content: { root: { children: [{ children: [{ text: 'body text' }] }] } },
  }

  it('renders the row number, dates, attachment count, relationship label, and content', () => {
    expect(formatPostCell(post, 'number', 7)).toBe('7')
    expect(formatPostCell(post, 'title', 1)).toBe('Hello')
    expect(formatPostCell(post, 'registrationDate', 1)).toBe('2026-07-01T00:00:00.000Z')
    expect(formatPostCell(post, 'modificationDate', 1)).toBe('2026-07-02T00:00:00.000Z')
    expect(formatPostCell(post, 'department', 1)).toBe('Records')
    expect(formatPostCell(post, 'attachment', 1)).toBe('2')
    expect(formatPostCell(post, 'content', 1)).toContain('body text')
  })

  it('renders empty for absent values', () => {
    expect(formatPostCell({}, 'author', 1)).toBe('')
  })
})

describe('isActiveNotice', () => {
  const now = new Date('2026-07-15T00:00:00.000Z')
  it('is true for a notice with now inside its window (bounds inclusive, open sides)', () => {
    expect(isActiveNotice({ isNotice: true }, now)).toBe(true)
    expect(
      isActiveNotice({ isNotice: true, noticeFrom: '2026-07-01', noticeTo: '2026-07-31' }, now),
    ).toBe(true)
  })
  it('is false for a non-notice or a notice outside its window', () => {
    expect(isActiveNotice({ isNotice: false }, now)).toBe(false)
    expect(isActiveNotice({ isNotice: true, noticeFrom: '2026-08-01' }, now)).toBe(false)
    expect(isActiveNotice({ isNotice: true, noticeTo: '2026-07-01' }, now)).toBe(false)
  })
})

describe('isNewPost', () => {
  const now = new Date('2026-07-15T00:00:00.000Z')
  it('is true within the window and false outside / for a non-positive window', () => {
    expect(isNewPost({ createdAt: '2026-07-14T00:00:00.000Z' }, 3, now)).toBe(true)
    expect(isNewPost({ createdAt: '2026-07-01T00:00:00.000Z' }, 3, now)).toBe(false)
    expect(isNewPost({ createdAt: '2026-07-14T00:00:00.000Z' }, 0, now)).toBe(false)
    expect(isNewPost({}, 3, now)).toBe(false)
  })
})

describe('paginate', () => {
  it('computes total pages, offset, and a page-window block', () => {
    const p = paginate(95, 1, 10, 10)
    expect(p.totalPages).toBe(10)
    expect(p.offset).toBe(0)
    expect(p.perPage).toBe(10)
    expect(p.pages).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(p.hasPrev).toBe(false)
    expect(p.hasNext).toBe(true)
  })

  it('clamps an out-of-range page and windows the pager block', () => {
    const p = paginate(230, 15, 10, 10) // 23 pages, page 15 → block 11..20
    expect(p.totalPages).toBe(23)
    expect(p.page).toBe(15)
    expect(p.offset).toBe(140)
    expect(p.pages[0]).toBe(11)
    expect(p.pages[p.pages.length - 1]).toBe(20)
    expect(p.hasNext).toBe(true)

    const over = paginate(5, 99, 10, 10) // 1 page, page clamps to 1
    expect(over.totalPages).toBe(1)
    expect(over.page).toBe(1)
    expect(over.hasNext).toBe(false)
  })

  it('always has at least one page when empty', () => {
    const p = paginate(0, 1, 10, 10)
    expect(p.totalPages).toBe(1)
    expect(p.pages).toEqual([1])
  })
})
