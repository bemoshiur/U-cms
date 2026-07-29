import React from 'react'

import type { NavNode } from '@/site/nav'
import { NavLink } from './NavLink'

/**
 * Left navigation (LNB) for eGov sub-pages (ref 2-13 GNB/LNB). Given the already
 * built GNB/LNB nav tree and the id of the current page's owning menu, it finds
 * the TOP section that contains the current menu and lists that section's
 * children with the active item highlighted (gov-blue). Pure presentation over
 * `buildNav` — no client JS, reuses the same visibility/ordering as the header.
 *
 * Returns `null` when there is no owning menu, or the section has no children
 * (nothing to show in a sidebar) — the page then renders single-column.
 */

/** Whether `node`'s subtree contains the menu id. */
function containsMenu(node: NavNode, id: string): boolean {
  return String(node.menu.id) === id || node.children.some((child) => containsMenu(child, id))
}

/** The top-level section node whose subtree contains the current menu. */
function findSection(nodes: NavNode[], id: string): NavNode | undefined {
  return nodes.find((node) => containsMenu(node, id))
}

/**
 * Whether an LNB sidebar would render for `activeMenuId` (a containing top
 * section exists AND it has children). Lets a page choose the two-column shell
 * vs. single-column WITHOUT duplicating the section-lookup logic.
 */
export function hasLeftNav(nodes: NavNode[], activeMenuId?: number | string | null): boolean {
  if (activeMenuId === undefined || activeMenuId === null) {
    return false
  }
  const section = findSection(nodes, String(activeMenuId))
  return section !== undefined && section.children.length > 0
}

/** Recursively renders the section's items, marking the active one. */
function LeftNavItems({ nodes, activeId }: { nodes: NavNode[]; activeId: string }) {
  return (
    <ul className="leftnav__list" role="list">
      {nodes.map((node) => {
        const isActive = String(node.menu.id) === activeId
        return (
          <li key={String(node.menu.id)} className="leftnav__item">
            <NavLink
              link={node.link}
              className={isActive ? 'leftnav__link leftnav__link--active' : 'leftnav__link'}
              aria-current={isActive ? 'page' : undefined}
            >
              {node.menu.name}
            </NavLink>
            {node.children.length > 0 && <LeftNavItems nodes={node.children} activeId={activeId} />}
          </li>
        )
      })}
    </ul>
  )
}

export function LeftNav({
  nodes,
  activeMenuId,
}: {
  nodes: NavNode[]
  activeMenuId?: number | string
}) {
  if (activeMenuId === undefined || activeMenuId === null) {
    return null
  }
  const activeId = String(activeMenuId)
  const section = findSection(nodes, activeId)
  if (!section || section.children.length === 0) {
    return null
  }
  return (
    <nav className="leftnav" aria-label={`${section.menu.name} section navigation`}>
      <h2 className="leftnav__title">{section.menu.name}</h2>
      <LeftNavItems nodes={section.children} activeId={activeId} />
    </nav>
  )
}
