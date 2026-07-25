import Link from 'next/link'
import React from 'react'

import type { Media, Site } from '@/payload-types'
import type { CurrentMember } from '@/site/member'
import type { GuideMenu, NavNode, ResolvedLink } from '@/site/nav'
import { orderedGuideMenus, resolveGuideLink } from '@/site/nav'
import { NavLink } from './NavLink'
import { PrimaryNav } from './PrimaryNav'

/**
 * Fixed top guide-bar defaults (ref 1-53): configured extras render AFTER these.
 * `sitemap` points at the real `/sitemap` page. `login`/`signup` are Task 4B
 * seams — the member-auth routes land with member sessions; they are kept here
 * so the utility bar is complete now and T4B only wires the destinations.
 */
const GUIDE_DEFAULTS: { key: string; label: string; href: string; loggedOutOnly?: boolean }[] = [
  { key: 'login', label: 'Login', href: '/login', loggedOutOnly: true },
  { key: 'signup', label: 'Sign up', href: '/signup', loggedOutOnly: true },
  { key: 'sitemap', label: 'Sitemap', href: '/sitemap' },
]

/** The populated logo media (depth-1), if present and served. */
function logoMedia(site: Site | null): Media | null {
  if (site && site.logo && typeof site.logo === 'object') {
    return site.logo
  }
  return null
}

/**
 * The public site header: brand (logo → site name fallback), the top guide bar
 * (defaults + configured extras), and the primary navigation. A single
 * `<header>` landmark; the nav lives in a `<nav aria-label="Primary">` wrapped
 * in a native `<details>` that becomes a hamburger on small screens (no JS).
 */
export function SiteHeader({
  site,
  navNodes,
  topGuides,
  member,
}: {
  site: Site | null
  navNodes: NavNode[]
  topGuides: GuideMenu[]
  member: CurrentMember
}) {
  const logo = logoMedia(site)
  const siteName = site?.name ?? 'Pulse CMS'
  const guides = orderedGuideMenus(topGuides)

  return (
    <header className="site-header">
      <div className="site-header__bar">
        <Link href="/" className="site-brand" aria-label={`${siteName} home`}>
          {logo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin CMS asset; avoids next/image remote-loader config
            <img
              className="site-brand__logo"
              src={logo.url}
              alt={logo.alt || siteName}
              width={logo.width ?? undefined}
              height={logo.height ?? undefined}
            />
          ) : (
            <span className="site-brand__name">{siteName}</span>
          )}
        </Link>

        <ul className="guide-bar" role="list">
          {GUIDE_DEFAULTS.filter((item) => !(item.loggedOutOnly && member != null)).map((item) => (
            <li key={item.key} className="guide-bar__item">
              <Link href={item.href} className="guide-bar__link">
                {item.label}
              </Link>
            </li>
          ))}
          {member != null && (
            <li className="guide-bar__item">
              <span className="member-bar">
                <Link href="/profile" className="guide-bar__link">
                  {member.name ? `My profile (${member.name})` : 'My profile'}
                </Link>
                {/* No-JS logout: POST clears the member cookie (see /logout route). */}
                <form className="member-bar__logout" action="/logout" method="post">
                  <button type="submit" className="member-bar__logout-btn">
                    Log out
                  </button>
                </form>
              </span>
            </li>
          )}
          {guides.map((guide) => {
            const link: ResolvedLink = resolveGuideLink(guide)
            return (
              <li key={String(guide.id)} className="guide-bar__item">
                <NavLink link={link} className="guide-bar__link">
                  {guide.name}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </div>

      <details className="site-nav">
        <summary className="site-nav__toggle" aria-label="Toggle navigation menu">
          <span className="site-nav__toggle-bar" aria-hidden="true" />
          <span className="site-nav__toggle-bar" aria-hidden="true" />
          <span className="site-nav__toggle-bar" aria-hidden="true" />
          <span className="site-nav__toggle-label">Menu</span>
        </summary>
        <nav aria-label="Primary" className="site-nav__panel">
          <PrimaryNav nodes={navNodes} />
        </nav>
      </details>
    </header>
  )
}
