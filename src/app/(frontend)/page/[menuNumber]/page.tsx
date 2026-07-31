import { notFound } from 'next/navigation'
import React from 'react'

import { resolveVisibleContentPage } from '@/site/access'
import { dataManagerEnabled, resolveDataManager } from '@/site/board'
import { getCurrentMember } from '@/site/member'
import { buildBreadcrumb, buildNav, visibleMenuIds } from '@/site/nav'
import { loadSatisfactionSummary, memberHasRated } from '@/site/satisfaction'
import { getActiveSite, getActiveSiteMenus, getPayloadClient } from '@/site/rsc'
import { Breadcrumb } from '../../_components/Breadcrumb'
import { hasLeftNav, LeftNav } from '../../_components/LeftNav'
import { RichTextContent } from '../../_components/RichTextContent'
import { PersonInCharge } from '../../_components/PersonInCharge'
import { SatisfactionWidget } from '../../_components/SatisfactionWidget'

/**
 * ISR: pure public web-content page. `getCurrentMember()` (menu visibility +
 * satisfaction "already rated" check) still forces per-request dynamic
 * rendering, same tradeoff as the board routes — see the note there.
 */
export const revalidate = 300

type RawSearch = Record<string, string | string[] | undefined>

function firstParam(raw: RawSearch, key: string): string | undefined {
  const v = raw[key]
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' && s.length > 0 ? s : undefined
}

/**
 * Web-content page route (`/page/[menuNumber]`, Task 4C — refs 2-2, 2-3).
 * Resolves the content menu + its PUBLISHED web content on the active site,
 * 404ing (via `resolveVisibleContentPage`) on unknown / cross-site / non-content
 * / unpublished / inactive AND on a menu hidden from THIS visitor (MEDIUM-1:
 * an inactive or `loggedInOnly`-for-anon menu 404s on direct URL). Renders the
 * title, the SAFE rich-text body, and the person-in-charge block only when the
 * site's `dataManagerEnabled` toggle is on.
 */
export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ menuNumber: string }>
  searchParams: Promise<RawSearch>
}) {
  const { menuNumber } = await params
  const raw = await searchParams
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
  const navNodes = buildNav(menus, { member })
  const showLnb = hasLeftNav(navNodes, resolved.menu.id)

  // Person-in-charge (담당자, ref 2-3) — ONLY when the site toggle is on.
  const person = dataManagerEnabled(site)
    ? await resolveDataManager(payload, resolved.menu.personInCharge, site.id)
    : null

  // Satisfaction widget (refs 2-18/2-19) — ONLY when the site toggle is on.
  const pageKey = `/page/${resolved.menu.menuNumber}`
  const satisfactionOn = site.satisfactionEnabled === true
  const summary = satisfactionOn ? await loadSatisfactionSummary(payload, site.id, pageKey) : null
  const alreadyRated =
    satisfactionOn && member != null
      ? await memberHasRated(payload, site.id, pageKey, member.id)
      : false

  const content = (
    <>
      <h1 className="page__title">{resolved.content.title || resolved.menu.name}</h1>
      <RichTextContent className="rich-text" data={resolved.content.content} />
      {person && <PersonInCharge person={person} />}
      {satisfactionOn && summary ? (
        <SatisfactionWidget
          pageKey={pageKey}
          menuId={resolved.menu.id}
          summary={summary}
          alreadyRated={alreadyRated}
          submitted={firstParam(raw, 'rated') === '1'}
          error={firstParam(raw, 'rateError')}
        />
      ) : null}
    </>
  )

  return (
    <div className="page page--content">
      <Breadcrumb trail={trail} />
      {showLnb ? (
        <div className="page-shell">
          <LeftNav nodes={navNodes} activeMenuId={resolved.menu.id} />
          <div className="page-shell__main">{content}</div>
        </div>
      ) : (
        content
      )}
    </div>
  )
}
