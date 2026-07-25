import { notFound } from 'next/navigation'
import React from 'react'

import { resolvePostForBoard } from '@/site/data'
import { buildBreadcrumb } from '@/site/nav'
import { getActiveSite, getActiveSiteMenus, getPayloadClient } from '@/site/rsc'
import { Breadcrumb } from '../../../_components/Breadcrumb'
import { menuIdForBoard } from '../../../_components/resolveBreadcrumbMenu'

/**
 * Post detail route (`/board/[bbsId]/[postId]`). Task 4A ships the resolvable
 * SCAFFOLD only: it resolves the post within its board on the active site (404
 * on unknown/cross-board/cross-site — and, conservatively, on secret posts;
 * proper member/secret gating is Task 4C) and renders the title with a
 * breadcrumb. The post body / attachments / comments are Task 4C.
 */
export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ bbsId: string; postId: string }>
}) {
  const { bbsId, postId } = await params
  const site = await getActiveSite()
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const resolved = await resolvePostForBoard(payload, site.id, bbsId, Number(postId))
  if (!resolved) {
    notFound()
  }

  const menus = await getActiveSiteMenus()
  const menuId = menuIdForBoard(menus, bbsId)
  const trail = menuId !== undefined ? buildBreadcrumb(menus, menuId) : []

  return (
    <div className="page page--post">
      <Breadcrumb trail={trail} currentLabel={resolved.post.title} />
      <h1 className="page__title">{resolved.post.title}</h1>
      <p className="page__meta">In {resolved.board.name}</p>
      <p className="page__placeholder">This post is coming soon (Task 4C).</p>
    </div>
  )
}
