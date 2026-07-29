import React from 'react'

import type { Site } from '@/payload-types'
import type { GuideMenu } from '@/site/nav'
import { orderedGuideMenus, resolveGuideLink, visibleFooterItems } from '@/site/nav'
import { NavLink } from './NavLink'

/** Footer keys that form the org/address block vs. the standalone copyright line. */
const COPYRIGHT_KEY = 'copyright'

/**
 * Static demo "related sites" (자주 찾는 사이트) for the footer family-site picker.
 * A no-JS native <details> disclosure of external links (opens in a new tab) —
 * the accessible, script-free equivalent of the KRDS family-site select.
 */
const FAMILY_SITES: { label: string; href: string }[] = [
  { label: 'Government 24 (gov.kr)', href: 'https://www.gov.kr' },
  { label: 'Korea.net', href: 'https://www.korea.net' },
  { label: 'Data Portal (data.go.kr)', href: 'https://www.data.go.kr' },
  { label: 'e-People (epeople.go.kr)', href: 'https://www.epeople.go.kr' },
]

/**
 * The public site footer (ref 1-19): the bottom guide bar (configured extras),
 * the org/address/contact block honoring each item's show flag, and the
 * copyright line. All content comes from the `sites.footer` group — a hidden or
 * empty item never renders (`visibleFooterItems`). One `<footer>` landmark.
 */
export function SiteFooter({
  site,
  bottomGuides,
}: {
  site: Site | null
  bottomGuides: GuideMenu[]
}) {
  const items = visibleFooterItems(site)
  const contactItems = items.filter((item) => item.key !== COPYRIGHT_KEY)
  const copyright = items.find((item) => item.key === COPYRIGHT_KEY)
  const guides = orderedGuideMenus(bottomGuides)

  return (
    <footer className="site-footer">
      {guides.length > 0 && (
        <nav aria-label="Footer" className="site-footer__nav">
          <ul className="footer-bar" role="list">
            {guides.map((guide) => (
              <li key={String(guide.id)} className="footer-bar__item">
                <NavLink link={resolveGuideLink(guide)} className="footer-bar__link">
                  {guide.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="site-footer__top">
        <details className="footer-family">
          <summary className="footer-family__summary">Related sites</summary>
          <ul className="footer-family__list" role="list">
            {FAMILY_SITES.map((s) => (
              <li key={s.href}>
                <a
                  className="footer-family__link"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="site-footer__body">
        {contactItems.length > 0 && (
          <address className="site-footer__contact">
            {contactItems.map((item) => (
              <span key={item.key} className="site-footer__contact-item">
                {item.value}
              </span>
            ))}
          </address>
        )}
        {copyright && <p className="site-footer__copyright">{copyright.value}</p>}
      </div>
    </footer>
  )
}
