/**
 * Public board render loaders (Task 4C, refs 2-5..2-8). Thin tenant-scoped reads
 * over the Local API that back the board list/detail routes. Like `./data.ts`
 * they use `overrideAccess: true` but CONSTRAIN every query to the board's site
 * (tenant) and drop secret posts — the RSC server is a trusted read surface and
 * safety comes from the explicit `where` scoping here (see `./data.ts` docblock).
 * The pure projection/pagination lives in `src/content/boardList.ts`; this module
 * only fetches.
 */

import type { Payload, Where } from 'payload'

import { buildPostSearchWhere, type PostSearchParams } from '../content/boardSearch'
import { isActiveNotice, paginate, type Pagination } from '../content/boardList'
import { getAssignedTenantIds } from '../access/tenantAccess'
import { toRelationId } from '../collections/utils'
import type { Board, Post } from '../payload-types'

/** Resolved data-manager (담당자, ref 2-3) display info. */
export type DataManagerInfo = {
  name: string
  department: string | null
  contact: string | null
}

/** Whether a site surfaces the person-in-charge block (ref 2-3 toggle). */
export function dataManagerEnabled(site: { dataManagerEnabled?: boolean | null } | null): boolean {
  return site?.dataManagerEnabled === true
}

/**
 * Resolves a menu's polymorphic `personInCharge` (a `users` or `departments`
 * record) into a display block (name/department/contact), or `null` when unset
 * or unresolvable. The CALLER gates on {@link dataManagerEnabled} first — this
 * only resolves the relationship for display.
 *
 * TENANT RE-SCOPE (L1): a `users` record must be ASSIGNED to the active site
 * (multi-tenant `users.tenants`) — a user of another site is NOT displayed
 * (fail-safe null), so an admin can't surface a foreign site's admin contact via
 * `personInCharge`. `personInCharge` is written under the menu's own
 * tenant-scoped access, but this public read uses `overrideAccess`, so we
 * re-verify here rather than trust the stored pointer. `departments` is a GLOBAL
 * collection (shared across sites — no per-site `tenant`), so there is no site
 * boundary to mismatch there and no cross-site contact to leak.
 */
export async function resolveDataManager(
  payload: Payload,
  value: unknown,
  tenantId: number | string,
): Promise<DataManagerInfo | null> {
  if (!value || typeof value !== 'object') {
    return null
  }
  const rel = value as { relationTo?: unknown; value?: unknown }
  const id = toRelationId(rel.value)
  if (id === undefined) {
    return null
  }
  try {
    if (rel.relationTo === 'departments') {
      // Global collection (no per-site tenant) — shared reference data.
      const dept = await payload.findByID({
        collection: 'departments',
        id,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
      })
      return dept ? { name: dept.name ?? '', department: null, contact: null } : null
    }
    if (rel.relationTo === 'users') {
      const user = await payload.findByID({
        collection: 'users',
        id,
        depth: 1,
        overrideAccess: true,
        disableErrors: true,
      })
      if (!user) {
        return null
      }
      // The user must be assigned to the active site (multi-tenant `users.tenants`).
      const assigned = getAssignedTenantIds(user).some((t) => String(t) === String(tenantId))
      if (!assigned) {
        return null
      }
      const dept = user.department
      const deptName =
        dept && typeof dept === 'object' ? ((dept as { name?: string }).name ?? null) : null
      return {
        name: (user.name as string) || (user.email as string) || '',
        department: deptName,
        contact: (user.email as string) ?? null,
      }
    }
  } catch {
    return null
  }
  return null
}

/** The board `kind` (from its board type), or `null` when unresolved. */
export type BoardKind = 'integrated' | 'photo' | 'qna' | 'faq' | 'attachment' | 'extended' | null

/** Resolves a board's behavioral kind from its populated `boardType`. */
export function boardKind(board: Board): BoardKind {
  const bt = board.boardType
  if (bt && typeof bt === 'object' && typeof (bt as { kind?: unknown }).kind === 'string') {
    return (bt as { kind: BoardKind }).kind
  }
  return null
}

/**
 * Loads a board by `bbsId` on the active site at depth 1 (so `boardType.kind`
 * and each category's `classificationCode` group are populated for rendering).
 * Tenant-scoped — a bbsId on another site resolves to `null`.
 */
export async function loadBoardDetail(
  payload: Payload,
  tenantId: number | string,
  bbsId: string,
): Promise<Board | null> {
  if (typeof bbsId !== 'string' || bbsId.length === 0) {
    return null
  }
  const found = await payload.find({
    collection: 'boards',
    where: { and: [{ tenant: { equals: tenantId } }, { bbsId: { equals: bbsId } }] },
    depth: 1,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}

/** The board sort applied to the regular post list (ref 1-28 sortOrder). */
function boardSort(board: Board): string {
  return board.sortOrder === 'oldest' ? 'createdAt' : '-createdAt'
}

/** Excludes secret posts from any public query (defense-in-depth, in the `where`). */
const NON_SECRET: Where = { isSecret: { not_equals: true } }

export type BoardListPage = {
  /** Pinned, in-window notices (shown only on page 1). */
  notices: Post[]
  /** The current page's regular (non-notice, non-secret) posts, searched. */
  posts: Post[]
  pagination: Pagination
}

/**
 * Loads one page of a board's post list (ref 2-7): the in-window pinned NOTICES
 * (page 1 only), plus the paginated NON-notice, NON-secret posts matching the
 * multi-criteria search. Uses the D6-hardened `buildPostSearchWhere`, so a
 * relationship/column-less searchable field can never 500 the list.
 */
export async function loadBoardListPage(
  payload: Payload,
  board: Board,
  params: PostSearchParams,
  requestedPage: number,
  now: Date = new Date(),
): Promise<BoardListPage> {
  const listCount =
    typeof board.listCount === 'number' && board.listCount > 0 ? board.listCount : 10
  const pageCount =
    typeof board.pageCount === 'number' && board.pageCount > 0 ? board.pageCount : 10
  const search = buildPostSearchWhere(board, board.id, params)

  // Regular posts: search AND non-secret AND non-notice, paginated by listCount.
  const regularWhere: Where = {
    and: [search, NON_SECRET, { isNotice: { not_equals: true } }],
  }
  const regular = await payload.find({
    collection: 'posts',
    where: regularWhere,
    depth: 1,
    page: Math.max(1, Math.floor(requestedPage) || 1),
    limit: listCount,
    sort: boardSort(board),
    overrideAccess: true,
  })

  const pagination = paginate(regular.totalDocs ?? 0, requestedPage, listCount, pageCount)

  // Pinned notices only on page 1 (few rows; window-filtered in JS).
  let notices: Post[] = []
  if (pagination.page === 1) {
    const noticeDocs = await payload.find({
      collection: 'posts',
      where: { and: [{ board: { equals: board.id } }, NON_SECRET, { isNotice: { equals: true } }] },
      depth: 1,
      limit: 0,
      pagination: false,
      sort: '-createdAt',
      overrideAccess: true,
    })
    notices = noticeDocs.docs.filter((p) => isActiveNotice(p, now))
  }

  return { notices, posts: regular.docs, pagination }
}

/**
 * Loads a board's gallery cards (photo/thumbnail boards): the most recent
 * non-secret posts, each carrying its (representative) attachment for the
 * thumbnail. Attachment bytes are still fetched via `/api/files/download`.
 */
export async function loadGalleryPosts(
  payload: Payload,
  board: Board,
  requestedPage: number,
): Promise<BoardListPage> {
  // Gallery reuses the list loader (no notices distinction needed, but harmless).
  return loadBoardListPage(payload, board, {}, requestedPage)
}

/**
 * Loads ALL non-secret posts for a board, ordered by the board's sort. Used by
 * the FAQ accordion (ref 2-6) and the Q&A list (ref 2-8) — small, un-paginated
 * lists whose kind-specific layout is applied by the render component.
 */
export async function loadAllBoardPosts(payload: Payload, board: Board): Promise<Post[]> {
  const found = await payload.find({
    collection: 'posts',
    where: { and: [{ board: { equals: board.id } }, NON_SECRET] },
    depth: 1,
    limit: 0,
    pagination: false,
    sort: boardSort(board),
    overrideAccess: true,
  })
  return found.docs
}

/**
 * Re-loads a resolved post at depth 1 for the DETAIL render (department /
 * categories / answeredBy populated). The caller must have already gated the
 * post via `resolveVisiblePost` (tenant + owning-menu + secret) — this only
 * resolves render data for an already-authorized post.
 */
export async function loadPostForRender(
  payload: Payload,
  postId: number | string,
): Promise<Post | null> {
  return payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 1,
    overrideAccess: true,
    disableErrors: true,
  })
}

/** A board category slot's select options for the search form (ref 1-29/2-7). */
export type BoardCategoryOptions = {
  slot: number
  title: string
  options: { id: number | string; label: string }[]
}

/**
 * Loads the select options for a board's category slots (ref 2-7 search by
 * category): for each configured category, the ACTIVE detail codes of its bound
 * classification group. Tenant-safety is inherent — the group is the board's own
 * bound group. Returns only in-use slots with at least one option.
 */
export async function loadBoardCategoryOptions(
  payload: Payload,
  board: Board,
): Promise<BoardCategoryOptions[]> {
  const cats = Array.isArray(board.categories) ? board.categories : []
  const result: BoardCategoryOptions[] = []
  for (let i = 0; i < cats.length; i++) {
    const cat = cats[i]
    if (!cat || cat.useFlag !== true) {
      continue
    }
    const group = cat.classificationCode
    const groupId =
      group && typeof group === 'object' ? (group as { id?: number | string }).id : group
    if (groupId === undefined || groupId === null) {
      continue
    }
    const codes = await payload.find({
      collection: 'codes',
      where: { and: [{ group: { equals: groupId } }, { isActive: { not_equals: false } }] },
      depth: 0,
      limit: 0,
      pagination: false,
      sort: 'order',
      overrideAccess: true,
    })
    const options = codes.docs.map((c) => ({
      id: c.id,
      label: (c.name as string) || String(c.id),
    }))
    if (options.length > 0) {
      result.push({ slot: i + 1, title: cat.title || `Category ${i + 1}`, options })
    }
  }
  return result
}

/**
 * Best-effort view-count increment on detail view (ref 1-28 viewCount).
 * `overrideAccess` bypasses the field's write lock; `skipPostSideEffects` skips
 * re-validation + audit. A failure must never break the render, so it is
 * swallowed (logged).
 */
export async function incrementViewCount(payload: Payload, post: Post): Promise<void> {
  try {
    const current = typeof post.viewCount === 'number' ? post.viewCount : 0
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { viewCount: current + 1 } as never,
      overrideAccess: true,
      context: { skipPostSideEffects: true, skipAudit: true },
    })
  } catch (err) {
    payload.logger?.error?.({ err }, '[board] viewCount increment failed')
  }
}
