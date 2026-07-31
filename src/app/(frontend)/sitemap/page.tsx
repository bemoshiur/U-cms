import type { Metadata } from 'next'
import React from 'react'

import { getCurrentMember } from '@/site/member'
import { buildNav } from '@/site/nav'
import type { NavNode } from '@/site/nav'
import { getActiveSiteMenus } from '@/site/rsc'
import { Breadcrumb } from '../_components/Breadcrumb'
import { NavLink } from '../_components/NavLink'

export const metadata: Metadata = {
  title: 'Sitemap',
  description: 'Full navigation map of the site.',
}

/**
 * ISR: pure public content (the menu tree, filtered for the visitor). Same
 * dynamic-rendering tradeoff as the other routes — see the note on the board
 * list page — the real cache win is the shell resolvers in `src/site/rsc.ts`.
 */
export const revalidate = 300

/** Recursively renders a nav subtree as a nested list (accessible, semantic). */
function SitemapNode({ node }: { node: NavNode }) {
  return (
    <li className="sitemap__item">
      <NavLink link={node.link} className="sitemap__link">
        {node.menu.name}
      </NavLink>
      {node.children.length > 0 && (
        <ul className="sitemap__children" role="list">
          {node.children.map((child) => (
            <SitemapNode key={String(child.menu.id)} node={child} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * Sitemap page (Task 4A Part 3): the full ACTIVE menu tree for the site as a
 * nested list, with every link resolved (`buildNav` already filters inactive /
 * exposure-hidden menus and orders siblings). Semantic headings + lists for
 * accessibility.
 */
export default async function SitemapPage() {
  const [menus, member] = await Promise.all([getActiveSiteMenus(), getCurrentMember()])
  const nodes = buildNav(menus, { member })

  return (
    <div className="page page--sitemap">
      <Breadcrumb trail={[]} />
      <h1 className="page__title">Sitemap</h1>
      {nodes.length === 0 ? (
        <p className="page__empty">No published menus yet.</p>
      ) : (
        <ul className="sitemap" role="list">
          {nodes.map((node) => (
            <SitemapNode key={String(node.menu.id)} node={node} />
          ))}
        </ul>
      )}
    </div>
  )
}
