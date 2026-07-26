import Link from 'next/link'
import React from 'react'

import type { BreadcrumbItem } from '@/site/nav'
import { NavLink } from './NavLink'

/**
 * Breadcrumb trail (ref 1-9/3-11), rendered from a menu-ancestry chain built by
 * `buildBreadcrumb`. Always prefixed with a Home crumb. Wrapped in
 * `<nav aria-label="Breadcrumb">` with an ordered list, per WAI-ARIA guidance.
 *
 * The current (leaf) crumb — rendered as `aria-current="page"`, not a link — is
 * either the last `trail` item (menu pages), or the explicit `currentLabel`
 * when the leaf is not a menu (e.g. a post detail under a board menu, where the
 * whole `trail` is ancestor links).
 */
export function Breadcrumb({
  trail,
  currentLabel,
}: {
  trail: BreadcrumbItem[]
  currentLabel?: string
}) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol className="breadcrumb__list" role="list">
        <li className="breadcrumb__item">
          <Link href="/" className="breadcrumb__link">
            Home
          </Link>
        </li>
        {trail.map((item, index) => {
          const isLeaf = currentLabel === undefined && index === trail.length - 1
          return (
            <li key={String(item.menu.id)} className="breadcrumb__item">
              {isLeaf ? (
                <span className="breadcrumb__current" aria-current="page">
                  {item.menu.name}
                </span>
              ) : (
                <NavLink link={item.link} className="breadcrumb__link">
                  {item.menu.name}
                </NavLink>
              )}
            </li>
          )
        })}
        {currentLabel !== undefined && (
          <li className="breadcrumb__item">
            <span className="breadcrumb__current" aria-current="page">
              {currentLabel}
            </span>
          </li>
        )}
      </ol>
    </nav>
  )
}
