import type { Metadata } from 'next'
import React from 'react'

import { branding } from '@/branding'
import { getCurrentMember } from '@/site/member'
import { buildNav } from '@/site/nav'
import { getActiveSite, getActiveSiteMenus } from '@/site/rsc'
import { NavLink } from './_components/NavLink'

export async function generateMetadata(): Promise<Metadata> {
  const site = await getActiveSite()
  return {
    title: site?.name ?? 'Home',
    description: site ? `Welcome to ${site.name}` : undefined,
  }
}

/**
 * Public site home (Task 4A). A minimal, tasteful landing built on the shared
 * chrome: a hero with the site name, and a section index derived from the
 * top-level GNB menus (each links to its resolved target). Rich content /
 * banners / boards render here in later Phase-4 tasks — this is the foundation.
 */
export default async function HomePage() {
  const [site, menus, member] = await Promise.all([
    getActiveSite(),
    getActiveSiteMenus(),
    getCurrentMember(),
  ])
  const nodes = buildNav(menus, { member })

  return (
    <div className="home">
      <section className="hero" aria-labelledby="hero-heading">
        <p className="hero__eyebrow">{site?.name ?? branding.productName}</p>
        <h1 id="hero-heading" className="hero__title">
          {site ? `Welcome to ${site.name}` : 'Welcome'}
        </h1>
        <p className="hero__lead">
          This is the public site. Browse the sections below or use the navigation above.
        </p>
      </section>

      {nodes.length > 0 && (
        <section className="section-index" aria-labelledby="sections-heading">
          <h2 id="sections-heading" className="section-index__heading">
            Sections
          </h2>
          <ul className="section-index__grid" role="list">
            {nodes.map((node) => (
              <li key={String(node.menu.id)} className="section-card">
                <NavLink link={node.link} className="section-card__link">
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
  )
}
