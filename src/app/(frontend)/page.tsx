import Link from 'next/link'
import type { Metadata } from 'next'
import React from 'react'

import { branding } from '@/branding'
import type { Post } from '@/payload-types'
import { loadBoardDetail, loadBoardListPage } from '@/site/board'
import { getCurrentMember } from '@/site/member'
import { buildNav, isBoardMenuAccessible, type NavNode } from '@/site/nav'
import {
  getActiveBanners,
  getActiveNotificationAreas,
  getActiveSite,
  getActiveSiteMenus,
  getPayloadClient,
} from '@/site/rsc'
import { BannerStrip } from './_components/BannerStrip'
import { NavLink } from './_components/NavLink'
import { NotificationTiles } from './_components/NotificationTiles'

/** ISR: pure public content, no per-visitor state in the cached HTML. */
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const site = await getActiveSite()
  return {
    title: site?.name ?? 'Home',
    description: site ? `Welcome to ${site.name}` : undefined,
  }
}

/** Formats an ISO date to `YYYY-MM-DD`, or `''` when absent/invalid. */
function fmtDate(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** The first `bbsId` reachable from a `board`-type menu, if any. */
function firstBoardBbsId(nodes: NavNode[]): string | undefined {
  for (const node of nodes) {
    if (node.link.kind === 'link' && !node.link.external && node.link.href.startsWith('/board/')) {
      return node.link.href.slice('/board/'.length)
    }
    const nested = firstBoardBbsId(node.children)
    if (nested) {
      return nested
    }
  }
  return undefined
}

/**
 * Public site home — an eGov main-visual hero (site name + intro + quick-link
 * buttons), a quick-menu grid of the top GNB sections, and a compact latest
 * NOTICES list drawn from the first accessible seeded board (best-effort: the
 * notices panel is simply omitted when no board is reachable). Built on the
 * shared chrome; all data comes from the cached shell resolvers + a light board
 * read (page-cached via `revalidate`).
 */
export default async function HomePage() {
  const [site, menus, member, banners, notificationAreas] = await Promise.all([
    getActiveSite(),
    getActiveSiteMenus(),
    getCurrentMember(),
    getActiveBanners(),
    getActiveNotificationAreas(),
  ])
  const nodes = buildNav(menus, { member })
  const siteName = site?.name ?? branding.productName

  // Best-effort latest notices from the first accessible board (never fatal).
  let notices: { id: number | string; bbsId: string; title: string; date: string }[] = []
  let noticesBbsId: string | undefined
  const bbsId = firstBoardBbsId(nodes)
  if (site && bbsId && isBoardMenuAccessible(menus, bbsId, member)) {
    try {
      const payload = await getPayloadClient()
      const board = await loadBoardDetail(payload, site.id, bbsId)
      if (board) {
        const { notices: pinned, posts } = await loadBoardListPage(payload, board, {}, 1)
        const rows: Post[] = [...pinned, ...posts].slice(0, 5)
        notices = rows.map((p) => ({
          id: p.id,
          bbsId,
          title: p.title,
          date: fmtDate(p.createdAt),
        }))
        noticesBbsId = bbsId
      }
    } catch {
      notices = []
    }
  }

  const quickLinks = nodes.filter((n) => n.link.kind === 'link').slice(0, 4)

  return (
    <div className="home">
      <section className="home__hero" aria-labelledby="hero-heading">
        <div className="home__hero-inner">
          <p className="hero__eyebrow">{siteName}</p>
          <h1 id="hero-heading" className="hero__title">
            {site ? `Welcome to ${site.name}` : 'Welcome'}
          </h1>
          <p className="hero__lead">
            The official public portal. Browse notices and services below, or use the navigation
            above to find what you need.
          </p>
          <div className="hero__actions">
            {quickLinks.map((node) => (
              <NavLink key={String(node.menu.id)} link={node.link} className="hero__btn">
                {node.menu.name}
              </NavLink>
            ))}
            <Link href="/sitemap" className="hero__btn hero__btn--ghost">
              Sitemap
            </Link>
          </div>
        </div>
      </section>

      <BannerStrip banners={banners} />

      <div className="home__grid">
        {notices.length > 0 && (
          <section className="home-panel" aria-labelledby="notices-heading">
            <div className="home-panel__head">
              <h2 id="notices-heading" className="home-panel__title">
                Notices
              </h2>
              {noticesBbsId && (
                <Link href={`/board/${noticesBbsId}`} className="home-panel__more">
                  View all +
                </Link>
              )}
            </div>
            <ul className="notice-list" role="list">
              {notices.map((n) => (
                <li key={String(n.id)} className="notice-list__item">
                  <Link href={`/board/${n.bbsId}/${n.id}`} className="notice-list__link">
                    <span className="notice-list__title">{n.title}</span>
                    {n.date && <span className="notice-list__date">{n.date}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {nodes.length > 0 && (
          <section className="home-panel section-index" aria-labelledby="sections-heading">
            <div className="home-panel__head">
              <h2 id="sections-heading" className="home-panel__title">
                Quick menu
              </h2>
            </div>
            <ul className="quick-menu" role="list">
              {nodes.map((node) => (
                <li key={String(node.menu.id)} className="section-card">
                  <NavLink link={node.link} className="quick-menu__link">
                    <span className="section-card__title">{node.menu.name}</span>
                    {node.children.length > 0 && (
                      <span className="section-card__meta">
                        {node.children.length} page{node.children.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <NotificationTiles areas={notificationAreas} />
    </div>
  )
}
