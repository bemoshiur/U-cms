import { notFound } from 'next/navigation'
import React from 'react'

import { getCurrentMember } from '@/site/member'
import { buildBreadcrumb, buildNav } from '@/site/nav'
import { resolveContentPage } from '@/site/data'
import { getActiveSite, getActiveSiteMenus, getPayloadClient } from '@/site/rsc'
import { Breadcrumb } from '../../_components/Breadcrumb'

/**
 * Web-content page route (`/page/[menuNumber]`). Task 4A ships the resolvable
 * SCAFFOLD only: it resolves the content menu + its published web content on
 * the active site (404 on unknown/cross-site/inactive/unbound) and renders the
 * title with a breadcrumb. Rendering the actual versioned rich-text body is
 * Task 4C — hence the "coming soon" placeholder.
 */
export default async function ContentPage({ params }: { params: Promise<{ menuNumber: string }> }) {
  const { menuNumber } = await params
  const site = await getActiveSite()
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const resolved = await resolveContentPage(payload, site.id, Number(menuNumber))
  if (!resolved) {
    notFound()
  }

  const [menus, member] = await Promise.all([getActiveSiteMenus(), getCurrentMember()])
  // Breadcrumb from the visible menu ancestry (buildNav-filtered set keeps it
  // consistent with the nav; the resolved menu itself is always the leaf).
  const visibleIds = new Set(collectIds(buildNav(menus, { member })))
  const trail = buildBreadcrumb(menus, resolved.menu.id).filter(
    (item) => item.menu.id === resolved.menu.id || visibleIds.has(String(item.menu.id)),
  )

  return (
    <div className="page page--content">
      <Breadcrumb trail={trail} />
      <h1 className="page__title">{resolved.content.title || resolved.menu.name}</h1>
      <p className="page__placeholder">
        This page is coming soon. Its content will render here (Task 4C).
      </p>
    </div>
  )
}

/** Flattens a nav tree to the set of visible menu ids (for breadcrumb filtering). */
function collectIds(nodes: ReturnType<typeof buildNav>): string[] {
  const ids: string[] = []
  const walk = (list: typeof nodes) => {
    for (const node of list) {
      ids.push(String(node.menu.id))
      walk(node.children)
    }
  }
  walk(nodes)
  return ids
}
