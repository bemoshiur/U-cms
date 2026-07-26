import { notFound } from 'next/navigation'
import React from 'react'

import { resolveVisibleContentPage } from '@/site/access'
import { dataManagerEnabled, resolveDataManager } from '@/site/board'
import { getCurrentMember } from '@/site/member'
import { buildBreadcrumb, visibleMenuIds } from '@/site/nav'
import { getActiveSite, getActiveSiteMenus, getPayloadClient } from '@/site/rsc'
import { Breadcrumb } from '../../_components/Breadcrumb'
import { RichTextContent } from '../../_components/RichTextContent'
import { PersonInCharge } from '../../_components/PersonInCharge'

/**
 * Web-content page route (`/page/[menuNumber]`, Task 4C — refs 2-2, 2-3).
 * Resolves the content menu + its PUBLISHED web content on the active site,
 * 404ing (via `resolveVisibleContentPage`) on unknown / cross-site / non-content
 * / unpublished / inactive AND on a menu hidden from THIS visitor (MEDIUM-1:
 * an inactive or `loggedInOnly`-for-anon menu 404s on direct URL). Renders the
 * title, the SAFE rich-text body, and the person-in-charge block only when the
 * site's `dataManagerEnabled` toggle is on.
 */
export default async function ContentPage({ params }: { params: Promise<{ menuNumber: string }> }) {
  const { menuNumber } = await params
  const [site, menus, member] = await Promise.all([
    getActiveSite(),
    getActiveSiteMenus(),
    getCurrentMember(),
  ])
  if (!site) {
    notFound()
  }

  const payload = await getPayloadClient()
  const resolved = await resolveVisibleContentPage(
    payload,
    site.id,
    Number(menuNumber),
    menus,
    member,
  )
  if (!resolved) {
    notFound()
  }

  // Breadcrumb from the visible menu ancestry (consistent with the nav).
  const visibleIds = visibleMenuIds(menus, member)
  const trail = buildBreadcrumb(menus, resolved.menu.id).filter(
    (item) => item.menu.id === resolved.menu.id || visibleIds.has(String(item.menu.id)),
  )

  // Person-in-charge (담당자, ref 2-3) — ONLY when the site toggle is on.
  const person = dataManagerEnabled(site)
    ? await resolveDataManager(payload, resolved.menu.personInCharge, site.id)
    : null

  return (
    <div className="page page--content">
      <Breadcrumb trail={trail} />
      <h1 className="page__title">{resolved.content.title || resolved.menu.name}</h1>
      <RichTextContent className="rich-text" data={resolved.content.content} />
      {person && <PersonInCharge person={person} />}
    </div>
  )
}
