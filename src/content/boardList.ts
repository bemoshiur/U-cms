import { toRelationId } from '../collections/utils'
import { postColumnForFieldKey } from './boardSearch'
import { extractLexicalText } from './wordFilter'

/**
 * Pure board-list/detail projection + pagination helpers (Task 4C, refs 1-31,
 * 1-32, 2-5, 2-7). No Payload runtime dependency, so the field projection, the
 * notice-pin sort, the New-icon window, and the pagination math are all
 * unit-tested in isolation and reused by the public list/detail routes (and the
 * cell formatter is shared with the CSV export endpoint).
 */

/** One field-grid row (subset the projection reads). */
export type ListFieldRow = {
  fieldKey?: string | null
  label?: string | null
  useFlag?: boolean | null
  listFlag?: boolean | null
  detailFlag?: boolean | null
}

/** The board shape the list/detail helpers read. */
export type BoardListLike = {
  fields?: ListFieldRow[] | null
  listFieldOrder?: unknown
  detailFieldOrder?: unknown
}

/** A resolved display column: the field key + its human label. */
export type DisplayColumn = { key: string; label: string }

function labelFor(board: BoardListLike, key: string): string {
  const rows = Array.isArray(board.fields) ? board.fields : []
  const row = rows.find((f) => f?.fieldKey === key)
  return (typeof row?.label === 'string' && row.label) || key
}

/** The set of field keys the board marks in-use with a given display flag. */
function keysWithFlag(board: BoardListLike, flag: 'listFlag' | 'detailFlag'): Set<string> {
  const rows = Array.isArray(board.fields) ? board.fields : []
  const keys = new Set<string>()
  for (const row of rows) {
    if (row?.useFlag === true && row?.[flag] === true && typeof row.fieldKey === 'string') {
      keys.add(row.fieldKey)
    }
  }
  return keys
}

/**
 * The ordered LIST columns (ref 1-31): the board's `listFieldOrder`, kept only
 * for fields that are in use AND flagged for the list (useFlag + listFlag), each
 * labeled from the field grid. Order comes from `listFieldOrder`; a listed key
 * with no matching in-use/list-flagged field is dropped.
 */
export function listColumns(board: BoardListLike): DisplayColumn[] {
  const order = Array.isArray(board.listFieldOrder)
    ? (board.listFieldOrder as unknown[]).filter((k): k is string => typeof k === 'string')
    : []
  const allowed = keysWithFlag(board, 'listFlag')
  return order
    .filter((key) => allowed.has(key))
    .map((key) => ({ key, label: labelFor(board, key) }))
}

/**
 * The ordered DETAIL fields (ref 1-32): the board's `detailFieldOrder`, kept
 * only for fields in use AND flagged for detail (useFlag + detailFlag),
 * independent of the list order.
 */
export function detailColumns(board: BoardListLike): DisplayColumn[] {
  const order = Array.isArray(board.detailFieldOrder)
    ? (board.detailFieldOrder as unknown[]).filter((k): k is string => typeof k === 'string')
    : []
  const allowed = keysWithFlag(board, 'detailFlag')
  return order
    .filter((key) => allowed.has(key))
    .map((key) => ({ key, label: labelFor(board, key) }))
}

/**
 * Renders one post's value for a board field key (shared by the list/detail
 * render AND the CSV export). `number` uses the caller-supplied 1-based row
 * number; the legacy date keys map to createdAt/updatedAt; `attachment` renders
 * the attachment count; `content` flattens the Lexical body; a relationship
 * (e.g. department) prefers a human label, else its id; everything else is the
 * raw column value.
 */
export function formatPostCell(
  post: Record<string, unknown>,
  fieldKey: string,
  rowNumber: number,
): string {
  switch (fieldKey) {
    case 'number':
      return String(rowNumber)
    case 'registrationDate':
      return typeof post.createdAt === 'string' ? post.createdAt : ''
    case 'modificationDate':
      return typeof post.updatedAt === 'string' ? post.updatedAt : ''
    case 'attachment':
      return String(Array.isArray(post.attachments) ? post.attachments.length : 0)
    case 'content':
      return extractLexicalText(post.content)
    default: {
      const raw = post[postColumnForFieldKey(fieldKey)]
      if (raw === null || raw === undefined) {
        return ''
      }
      if (typeof raw === 'object') {
        const rel = raw as { name?: unknown; title?: unknown }
        if (typeof rel.name === 'string') return rel.name
        if (typeof rel.title === 'string') return rel.title
        const id = toRelationId(raw)
        return id === undefined ? '' : String(id)
      }
      return String(raw)
    }
  }
}

/**
 * The canonical managed-download URL for a post attachment (ref 1-81). The ONLY
 * public way to fetch a board attachment is `/api/files/download` (T4B:
 * members-only, same-site, non-secret) — never a raw media/attachment path. Both
 * ids are URL-encoded. Pure, so it is unit-tested and shared by every render.
 */
export function fileDownloadUrl(postId: number | string, fileSn: number | string): string {
  return `/api/files/download?post=${encodeURIComponent(String(postId))}&fileSn=${encodeURIComponent(String(fileSn))}`
}

// ── Notice pin window + New icon ─────────────────────────────────────────────

function toEpoch(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const ms = value instanceof Date ? value.getTime() : new Date(String(value)).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

/** A post shape the notice/new helpers read. */
export type PostTimingLike = {
  isNotice?: boolean | null
  noticeFrom?: string | Date | null
  noticeTo?: string | Date | null
  createdAt?: string | Date | null
}

/**
 * Whether a notice post is CURRENTLY pinned (ref 2-7): it is a notice and `now`
 * is within `[noticeFrom, noticeTo]` (each bound inclusive; an absent bound is
 * open on that side). A non-notice is never pinned.
 */
export function isActiveNotice(post: PostTimingLike, now: Date = new Date()): boolean {
  if (post.isNotice !== true) {
    return false
  }
  const t = now.getTime()
  const from = toEpoch(post.noticeFrom)
  if (from !== undefined && t < from) {
    return false
  }
  const to = toEpoch(post.noticeTo)
  if (to !== undefined && t > to) {
    return false
  }
  return true
}

/**
 * Whether a post shows the New icon (ref 1-28): its `createdAt` is within
 * `windowDays` days of `now`. A non-positive window (or no createdAt) → never new.
 */
export function isNewPost(
  post: PostTimingLike,
  windowDays: number | null | undefined,
  now: Date = new Date(),
): boolean {
  const days = typeof windowDays === 'number' ? windowDays : 0
  if (days <= 0) {
    return false
  }
  const created = toEpoch(post.createdAt)
  if (created === undefined) {
    return false
  }
  return now.getTime() - created <= days * 24 * 60 * 60 * 1000
}

// ── Pagination (ref 2-7: listCount rows per page, pageCount page-window) ──────

export type Pagination = {
  /** The clamped current page (1-based). */
  page: number
  /** Total pages (at least 1). */
  totalPages: number
  /** 0-based row offset for the current page (for a DB `page`/`limit` query). */
  offset: number
  /** Rows per page. */
  perPage: number
  /** The page numbers to render in the pager block (a window of `pageWindow`). */
  pages: number[]
  hasPrev: boolean
  hasNext: boolean
}

/**
 * Pagination math (ref 2-7). `perPage` = board.listCount, `pageWindow` =
 * board.pageCount (how many page links show in the pager block). The current
 * `page` is clamped into `[1, totalPages]`; the pager block is the contiguous
 * window of `pageWindow` pages containing the current page. Pure — the route
 * feeds `offset`/`perPage` to the posts query and renders `pages`.
 */
export function paginate(
  totalItems: number,
  requestedPage: number,
  perPage: number,
  pageWindow: number,
): Pagination {
  const safePerPage = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : 10
  const safeWindow = Number.isFinite(pageWindow) && pageWindow > 0 ? Math.floor(pageWindow) : 10
  const total = Number.isFinite(totalItems) && totalItems > 0 ? Math.floor(totalItems) : 0
  const totalPages = Math.max(1, Math.ceil(total / safePerPage))
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages)

  const blockStart = Math.floor((page - 1) / safeWindow) * safeWindow + 1
  const blockEnd = Math.min(totalPages, blockStart + safeWindow - 1)
  const pages: number[] = []
  for (let p = blockStart; p <= blockEnd; p++) {
    pages.push(p)
  }

  return {
    page,
    totalPages,
    offset: (page - 1) * safePerPage,
    perPage: safePerPage,
    pages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  }
}
