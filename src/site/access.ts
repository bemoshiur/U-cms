/**
 * Visibility-gated public-site resolvers (Task 4C — closes T4A MEDIUM-1).
 *
 * The Task 4A resolvers in `./data.ts` are TENANT-scoped (a read never crosses
 * sites) but do NOT re-check the OWNING MENU's visibility — so a content page or
 * board whose menu is hidden from the nav (inactive, or `loggedInOnly` for an
 * anonymous visitor) was still reachable by typing its direct URL. These
 * wrappers add that gate: they run the tenant resolver, then require the owning
 * menu to be visible to the current visitor ({@link visibleMenuIds} /
 * {@link isBoardMenuAccessible}, the SAME predicate `buildNav` uses for the
 * header), returning `null` (→ the route's `notFound()` → 404) when it is not.
 *
 * They take the already-loaded `menus` + `member` (the layout/route fetch them
 * once) so they stay integration-testable without a Next request, and so the
 * gate uses the REAL member session (T4B `getCurrentMember`) for
 * `exposureCondition`. Secret-post handling is inherited from
 * {@link resolvePostForBoard} (secret → `null` on the public site; a member is
 * never matched as the author because posts carry no member-author link — a
 * documented T4C deferral, so members get 404 on secret posts too).
 */

import type { Payload } from 'payload'

import type { Board, Menu } from '../payload-types'
import {
  resolveBoardByBbsId,
  resolveContentPage,
  resolvePostForBoard,
  type ResolvedContentPage,
  type ResolvedPost,
} from './data'
import type { CurrentMember } from './member'
import { isBoardMenuAccessible, visibleMenuIds } from './nav'

/**
 * Resolves `/page/[menuNumber]` for the visitor, or `null` when the content
 * menu is hidden from them (inactive / exposure-denied / hidden ancestor) — in
 * addition to every `null` case {@link resolveContentPage} already covers
 * (unknown / cross-site / non-content / unpublished).
 */
export async function resolveVisibleContentPage(
  payload: Payload,
  tenantId: number | string,
  menuNumber: number,
  menus: Menu[],
  member: CurrentMember,
): Promise<ResolvedContentPage | null> {
  const resolved = await resolveContentPage(payload, tenantId, menuNumber)
  if (!resolved) {
    return null
  }
  if (!visibleMenuIds(menus, member).has(String(resolved.menu.id))) {
    return null // owning menu hidden from this visitor → 404 on direct URL
  }
  return resolved
}

/**
 * Resolves `/board/[bbsId]` for the visitor, or `null` when EVERY menu that
 * opens the board is hidden from them (inactive / exposure-denied) — in addition
 * to the tenant/unknown `null` cases {@link resolveBoardByBbsId} covers. A board
 * that no menu references stays directly addressable (see
 * {@link isBoardMenuAccessible}).
 */
export async function resolveVisibleBoard(
  payload: Payload,
  tenantId: number | string,
  bbsId: string,
  menus: Menu[],
  member: CurrentMember,
): Promise<Board | null> {
  const board = await resolveBoardByBbsId(payload, tenantId, bbsId)
  if (!board) {
    return null
  }
  if (!isBoardMenuAccessible(menus, bbsId, member)) {
    return null
  }
  return board
}

/**
 * Resolves `/board/[bbsId]/[postId]` for the visitor, or `null` when the board
 * is hidden from them, the post is secret, or any tenant/board/coherence check
 * from {@link resolvePostForBoard} fails.
 */
export async function resolveVisiblePost(
  payload: Payload,
  tenantId: number | string,
  bbsId: string,
  postId: number,
  menus: Menu[],
  member: CurrentMember,
): Promise<ResolvedPost | null> {
  if (!isBoardMenuAccessible(menus, bbsId, member)) {
    return null // owning menu hidden → the post under it 404s too
  }
  return resolvePostForBoard(payload, tenantId, bbsId, postId)
}
