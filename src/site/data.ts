/**
 * Public-site data resolvers (Task 4A). Thin, tenant-scoped reads over the
 * Local API that back the RSC layout and the placeholder routes. Every function
 * takes an explicit `payload` so it is integration-testable without a running
 * Next server (see tests/int/publicSite.int.spec.ts); the RSC layer in
 * `./rsc.ts` wraps these with a request-scoped cache.
 *
 * ## `overrideAccess: true` — deliberate, and safe
 *
 * The public frontend has no authenticated `req.user`, but the tenant-scoped
 * collections (`menus`, `boards`, `webContents`, `posts`, `guideMenus`) gate
 * `read` on an admin user + tenant membership (`tenantScopedMenuAccess`). So
 * server-side public reads MUST use `overrideAccess: true` — the RSC server is
 * a trusted read surface. Safety comes from these resolvers themselves: every
 * query is CONSTRAINED to the active site's `tenant`, so nothing cross-site is
 * ever returned, and the render layer additionally filters by `active` /
 * `exposureCondition` (`buildNav`). Public content reads filter `_status` to
 * `published` EXPLICITLY (`resolveContentPage`) — `find()` does NOT default to
 * published, so a draft-from-start doc would otherwise leak. Writes are never
 * performed here.
 */

import type { Payload } from 'payload'

import type { Board, GuideMenu, Menu, Post, Site, WebContent } from '../payload-types'
import { getPublicSiteId } from './config'

/**
 * Loads the active public site (see `./config.ts` for the resolution seam),
 * or `null` when it does not exist / is not a user-facing site. An admin site
 * (`isAdminSite`) is never served as a public site. `siteId` overrides the
 * env-resolved default (used by tests to target a fixture site).
 */
export async function resolveSiteRecord(
  payload: Payload,
  siteId: string = getPublicSiteId(),
): Promise<Site | null> {
  const found = await payload.find({
    collection: 'sites',
    where: { siteId: { equals: siteId } },
    depth: 1, // populate `logo` → media (for its url/dimensions)
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const site = found.docs[0]
  if (!site || site.isAdminSite) {
    return null
  }
  return site
}

/**
 * All menus for a site (tenant), populated one level deep so a `board`-type
 * menu carries its board's `bbsId` for link resolution. Returned unfiltered and
 * unsorted — the pure `buildNav` applies visibility (active / exposureCondition)
 * and ordering. `limit: 0` fetches every row (a site's menu tree is small).
 */
export async function getSiteMenus(payload: Payload, tenantId: number | string): Promise<Menu[]> {
  const found = await payload.find({
    collection: 'menus',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs
}

/** Active guide menus for a site's top/bottom utility bar (unsorted — see `orderedGuideMenus`). */
export async function getGuideMenus(
  payload: Payload,
  tenantId: number | string,
  position: 'top' | 'bottom',
): Promise<GuideMenu[]> {
  const found = await payload.find({
    collection: 'guideMenus',
    where: { and: [{ tenant: { equals: tenantId } }, { position: { equals: position } }] },
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs
}

/** A menu bound to published web content, as the `/page/[menuNumber]` route needs it. */
export type ResolvedContentPage = { menu: Menu; content: WebContent }

/**
 * Resolves the content page for `/page/[menuNumber]` on the active site, or
 * `null` (→ 404) when: the number is invalid, no menu on THIS site has it, the
 * menu is not a `content` menu, the menu is inactive, or no published web
 * content is bound to it. Tenant-scoped: a menuNumber that exists only on
 * another site resolves to `null` here.
 */
export async function resolveContentPage(
  payload: Payload,
  tenantId: number | string,
  menuNumber: number,
): Promise<ResolvedContentPage | null> {
  if (!Number.isInteger(menuNumber)) {
    return null
  }
  const menus = await payload.find({
    collection: 'menus',
    where: {
      and: [{ tenant: { equals: tenantId } }, { menuNumber: { equals: menuNumber } }],
    },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const menu = menus.docs[0]
  if (!menu || menu.contentType !== 'content' || menu.active === false) {
    return null
  }
  const contents = await payload.find({
    collection: 'webContents',
    // B3: filter `_status` explicitly. `find()` does NOT add a `_status` clause,
    // so a doc CREATED as a draft (draft-from-start) has its draft body in the
    // main table with `_status='draft'` and would otherwise render publicly.
    // Requiring `published` returns nothing for a never-published draft → 404.
    where: {
      and: [{ menu: { equals: menu.id } }, { _status: { equals: 'published' } }],
    },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const content = contents.docs[0]
  if (!content) {
    return null
  }
  return { menu, content }
}

/**
 * Resolves a board by its `bbsId` on the active site for `/board/[bbsId]`, or
 * `null` (→ 404) when it does not exist on THIS site. Tenant-scoped: a bbsId
 * belonging to another site resolves to `null`.
 */
export async function resolveBoardByBbsId(
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
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return found.docs[0] ?? null
}

/** A post resolved for `/board/[bbsId]/[postId]` together with its board. */
export type ResolvedPost = { board: Board; post: Post }

/**
 * Resolves a post for `/board/[bbsId]/[postId]` on the active site, or `null`
 * (→ 404) when: the board is not on this site, the id is invalid, the post does
 * not exist, the post belongs to a different board/site, or the post is secret.
 *
 * SECRET posts return `null` here deliberately — proper member/owner/secret
 * permission handling is Task 4C; until then the scaffold never exposes a
 * private post. That gating is intentionally conservative, not final.
 */
export async function resolvePostForBoard(
  payload: Payload,
  tenantId: number | string,
  bbsId: string,
  postId: number,
): Promise<ResolvedPost | null> {
  const board = await resolveBoardByBbsId(payload, tenantId, bbsId)
  if (!board || !Number.isInteger(postId)) {
    return null
  }
  const post = await payload.findByID({
    collection: 'posts',
    id: postId,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })
  if (!post) {
    return null
  }
  const postBoardId = typeof post.board === 'object' ? post.board?.id : post.board
  const postTenantId = typeof post.tenant === 'object' ? post.tenant?.id : post.tenant
  if (String(postBoardId) !== String(board.id) || String(postTenantId) !== String(tenantId)) {
    return null
  }
  if (post.isSecret) {
    return null // T4C: real secret/member gating
  }
  return { board, post }
}
