import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { buildPostSearchWhere } from '../content/boardSearch'
import type { BoardFieldRow, PostSearchParams } from '../content/boardSearch'
import { formatPostCell } from '../content/boardList'
import { findAccessibleDoc, notFoundResponse } from '../security/existenceOracle'

/**
 * Board post EXCEL/CSV export (Task 3D Part 5 / TODO 3.10; ref 2-7 excel
 * export). Collection endpoint mounted at:
 *
 *   GET /api/boards/:id/export?keyword=&field=&category1=&periodFrom=&periodTo=
 *
 * Returns a CSV of the board's posts, using the board's configured LIST fields
 * (`listFieldOrder`, ref 1-31) as columns and honoring the multi-criteria
 * search (`buildPostSearchWhere`, ref 2-7 — only board fields with `searchFlag`
 * are searchable; see `content/boardSearch.ts`). ACCESS-GATED + TENANT-SCOPED:
 * the caller must be able to READ the board (`content.boards` + assigned site),
 * and the posts query runs under normal access control (`content.posts` +
 * tenant), so a cross-tenant caller gets a 403 (board) or an empty export.
 *
 * CSV (not XLSX) keeps this dependency-free; a real spreadsheet export is a
 * Phase-4 concern. The value formatter guards against CSV formula injection.
 */

/** Quotes a CSV cell and neutralizes leading formula characters (=,+,-,@). */
function csvCell(value: string): string {
  const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${neutralized.replace(/"/g, '""')}"`
}

type BoardLike = {
  id: string | number
  name?: unknown
  fields?: (BoardFieldRow & { label?: unknown })[] | null
  listFieldOrder?: unknown
}

function readSearchParams(sp: URLSearchParams | undefined): PostSearchParams {
  if (!sp) {
    return {}
  }
  return {
    keyword: sp.get('keyword'),
    field: sp.get('field'),
    category1: sp.get('category1'),
    category2: sp.get('category2'),
    category3: sp.get('category3'),
    periodFrom: sp.get('periodFrom'),
    periodTo: sp.get('periodTo'),
  }
}

/**
 * Testable core — resolves access to the board, runs the (access-scoped,
 * searched) posts query, and returns a CSV Response (or an error Response).
 * Pure of any HTTP framework so integration tests call it directly.
 */
export async function handleBoardExport(args: {
  payload: Payload
  user: unknown
  id: string | number | null | undefined
  params?: PostSearchParams
  req?: PayloadRequest
}): Promise<Response> {
  const { payload, user, req } = args
  const id = args.id

  if (id === null || id === undefined || id === '') {
    return Response.json({ ok: false, message: 'A board id is required.' }, { status: 400 })
  }

  // Existence-then-access via the shared guard (D1/D2/D3): a missing board, a
  // cross-tenant board, and an anonymous/ungranted caller ALL collapse to the
  // SAME 404 — the export never confirms a board id exists to someone who may
  // not read it. No custom predicate → the collection's tenant-scoped
  // `content.boards` read access decides.
  const board = await findAccessibleDoc<BoardLike>({
    payload,
    collection: 'boards',
    id,
    user,
    req,
  })
  if (!board) {
    return notFoundResponse()
  }

  // Column keys from the board's list-field order (fallback to a title column).
  const listOrder = Array.isArray(board.listFieldOrder)
    ? (board.listFieldOrder as string[]).filter((k) => typeof k === 'string')
    : []
  const columns = listOrder.length > 0 ? listOrder : ['title']

  // Column labels from the field grid (fieldKey → label; falls back to the key).
  const labelByKey = new Map<string, string>()
  for (const f of Array.isArray(board.fields) ? board.fields : []) {
    if (typeof f?.fieldKey === 'string') {
      labelByKey.set(f.fieldKey, typeof f.label === 'string' && f.label ? f.label : f.fieldKey)
    }
  }

  // Posts query — access-scoped (content.posts + tenant) + the search criteria.
  const where = buildPostSearchWhere(board, id, args.params ?? {})
  const posts = await payload.find({
    collection: 'posts',
    where,
    depth: 1,
    limit: 0,
    pagination: false,
    sort: '-createdAt',
    overrideAccess: false,
    user: user as PayloadRequest['user'],
    req,
  })

  const header = columns.map((key) => csvCell(labelByKey.get(key) ?? key)).join(',')
  const rows = posts.docs.map((post, i) =>
    columns
      .map((key) => csvCell(formatPostCell(post as unknown as Record<string, unknown>, key, i + 1)))
      .join(','),
  )
  // Prepend a UTF-8 BOM so Excel opens Korean/Unicode content correctly.
  const csv = `﻿${[header, ...rows].join('\r\n')}\r\n`

  const filename = `board-${typeof board.name === 'string' ? board.name.replace(/[^\w.-]+/g, '_') : id}-posts.csv`
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

export const boardExportEndpoint: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req) =>
    handleBoardExport({
      payload: req.payload,
      user: req.user,
      req,
      id: req.routeParams?.id as string | undefined,
      params: readSearchParams(req.searchParams),
    }),
}
