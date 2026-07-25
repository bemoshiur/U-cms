import { notFound } from 'next/navigation'
import React from 'react'

import { resolveBoardByBbsId } from '@/site/data'
import { buildBreadcrumb } from '@/site/nav'
import { getActiveSite, getActiveSiteMenus, getPayloadClient } from '@/site/rsc'
import { Breadcrumb } from '../../_components/Breadcrumb'
import { menuIdForBoard } from '../../_components/resolveBreadcrumbMenu'

/**
 * Board list route (`/board/[bbsId]`). Task 4A ships the resolvable SCAFFOLD
 * only: it resolves the board on the active site (404 on unknown/cross-site)
 * and renders the board name with a breadcrumb. The actual post list (paging,
 * search, thumbnails) is Task 4C — hence the placeholder.
 */
export default async function BoardListPage({ params }: { params: Promise<{ bbsId: string }> }) {
  const { bbsId } = await params
  const site = await getActiveSite()
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const board = await resolveBoardByBbsId(payload, site.id, bbsId)
  if (!board) {
    notFound()
  }

  const menus = await getActiveSiteMenus()
  const menuId = menuIdForBoard(menus, bbsId)
  const trail = menuId !== undefined ? buildBreadcrumb(menus, menuId) : []

  return (
    <div className="page page--board">
      <Breadcrumb trail={trail} />
      <h1 className="page__title">{board.name}</h1>
      <p className="page__placeholder">The post list for this board is coming soon (Task 4C).</p>
    </div>
  )
}
