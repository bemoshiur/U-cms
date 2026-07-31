import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { detailColumns } from '@/content/boardList'
import { resolveVisiblePost } from '@/site/access'
import { boardKind, incrementViewCount, loadBoardDetail, loadPostForRender } from '@/site/board'
import { getCurrentMember } from '@/site/member'
import { buildBreadcrumb, buildNav } from '@/site/nav'
import { getActiveSite, getActiveSiteMenus, getPayloadClient } from '@/site/rsc'
import { Breadcrumb } from '../../../_components/Breadcrumb'
import { hasLeftNav, LeftNav } from '../../../_components/LeftNav'
import { menuIdForBoard } from '../../../_components/resolveBreadcrumbMenu'
import { PostDetail } from '../../../_components/board/PostDetail'

/**
 * ISR: public board read. As with the list page, `getCurrentMember()` (needed
 * for the visibility gate below) forces per-request dynamic rendering, so this
 * doesn't statically cache the HTML — the cache win is the shared shell
 * resolvers. Kept consistent with the other public content routes.
 */
export const revalidate = 300

/**
 * Post detail route (`/board/[bbsId]/[postId]`, Task 4C — ref 2-5). Resolves the
 * post within its board on the active site via `resolveVisiblePost`, which 404s
 * on unknown / cross-board / cross-site / SECRET AND on a hidden owning menu
 * (MEDIUM-1). Renders the detail fields in the board's `detailFieldOrder`, the
 * SAFE rich-text body, attachment links through `/api/files/download`, and (for
 * Q&A) the admin answer thread. View count is bumped best-effort.
 *
 * Comments (board.commentsEnabled) and prev/next (board.prevNextEnabled) are
 * DEFERRED — see task-4C-report.md (no comments collection exists yet).
 */
export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ bbsId: string; postId: string }>
}) {
  const { bbsId, postId } = await params
  const [site, menus, member] = await Promise.all([
    getActiveSite(),
    getActiveSiteMenus(),
    getCurrentMember(),
  ])
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const gated = await resolveVisiblePost(payload, site.id, bbsId, Number(postId), menus, member)
  if (!gated) {
    notFound()
  }

  // Re-load at depth 1 for render (department / categories / answeredBy) and the
  // board at depth 1 for its kind + detail field order.
  const [post, board] = await Promise.all([
    loadPostForRender(payload, gated.post.id),
    loadBoardDetail(payload, site.id, bbsId),
  ])
  if (!post || !board) {
    notFound()
  }

  // Best-effort view-count increment (never blocks/breaks the render).
  await incrementViewCount(payload, post)

  const menuId = menuIdForBoard(menus, bbsId)
  const trail = menuId !== undefined ? buildBreadcrumb(menus, menuId) : []
  const navNodes = buildNav(menus, { member })
  const showLnb = hasLeftNav(navNodes, menuId)

  const content = (
    <>
      <h1 className="page__title">{post.title}</h1>
      <p className="page__meta">In {board.name}</p>
      <PostDetail post={post} columns={detailColumns(board)} isQna={boardKind(board) === 'qna'} />
      <div className="post-detail__actions">
        <Link href={`/board/${bbsId}`} className="button button--ghost">
          목록 (List)
        </Link>
      </div>
    </>
  )

  return (
    <div className="page page--post">
      <Breadcrumb trail={trail} currentLabel={post.title} />
      {showLnb ? (
        <div className="page-shell">
          <LeftNav nodes={navNodes} activeMenuId={menuId} />
          <div className="page-shell__main">{content}</div>
        </div>
      ) : (
        content
      )}
    </div>
  )
}
