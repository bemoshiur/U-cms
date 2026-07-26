import React from 'react'

import type { NavNode } from '@/site/nav'
import { NavLink } from './NavLink'

/**
 * The primary global navigation (GNB) with one level of drop-down children
 * (LNB). Pure presentation over the `buildNav` tree — no client JS: the mobile
 * disclosure uses a native `<details>` (see `SiteHeader`) and the desktop
 * drop-down is CSS `:hover`/`:focus-within`, so it is keyboard-reachable and
 * works without hydration. Nested `<ul>`s keep the structure semantic for
 * screen readers.
 */
export function PrimaryNav({ nodes }: { nodes: NavNode[] }) {
  if (nodes.length === 0) {
    return null
  }
  return (
    <ul className="gnb" role="list">
      {nodes.map((node) => (
        <li key={String(node.menu.id)} className="gnb__item">
          <NavLink link={node.link} className="gnb__link">
            {node.menu.name}
          </NavLink>
          {node.children.length > 0 && (
            <ul className="lnb" role="list">
              {node.children.map((child) => (
                <li key={String(child.menu.id)} className="lnb__item">
                  <NavLink link={child.link} className="lnb__link">
                    {child.menu.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
