import React from 'react'

import type { Site } from '@/payload-types'
import type { GuideMenu } from '@/site/nav'
import { orderedGuideMenus, resolveGuideLink, visibleFooterItems } from '@/site/nav'
import { NavLink } from './NavLink'

/** Footer keys that form the org/address block vs. the standalone copyright line. */
const COPYRIGHT_KEY = 'copyright'

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
