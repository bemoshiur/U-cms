import React from 'react'

import { branding } from '@/branding'
import { getCurrentMember } from '@/site/member'
import { buildNav } from '@/site/nav'
import { getActiveGuideMenus, getActiveSite, getActiveSiteMenus } from '@/site/rsc'
import { SiteFooter } from './_components/SiteFooter'
import { SiteHeader } from './_components/SiteHeader'
import './styles.css'

export const metadata = {
  title: branding.productName,
  description: branding.tagline,
}

/**
 * Force dynamic (per-request) rendering for the whole public site. Every page
 * reads live site/menu/footer data from the DB and will become member-aware in
 * T4B, so it must never be statically prerendered at build time — otherwise a
 * CI build (which runs before the DB is seeded) would bake in empty chrome.
 * Applies to all nested `(frontend)` routes via route-segment-config inheritance.
 */
export const dynamic = 'force-dynamic'

/**
 * Root layout for the PUBLIC site (Task 4A). Resolves the active site (see
 * `src/site/config.ts` for the resolution seam) and renders the shared chrome
 * around every page:
 *  - a skip-to-content link + semantic landmarks (header / nav / main / footer)
 *    for baseline accessibility (full KWCAG audit is Phase 8),
 *  - the header (logo, site name, GNB primary nav, top guide bar), and
 *  - the footer (org/contact block from `sites.footer`, bottom guide bar).
 *
 * The visitor's member state comes from the T4B seam (`getCurrentMember`, null
 * today), threaded into `buildNav` so `exposureCondition` filtering already
 * works. Menus/guides are loaded via request-cached RSC loaders so the page
 * this layout wraps reuses the same fetch for its LNB/breadcrumb.
 */
export default async function FrontendLayout({ children }: { children: React.ReactNode }) {
  const [site, menus, topGuides, bottomGuides, member] = await Promise.all([
    getActiveSite(),
    getActiveSiteMenus(),
    getActiveGuideMenus('top'),
    getActiveGuideMenus('bottom'),
    getCurrentMember(),
  ])

  const navNodes = buildNav(menus, { member })

  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <div className="site-shell">
          <SiteHeader site={site} navNodes={navNodes} topGuides={topGuides} member={member} />
          <main id="main-content" className="site-main" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter site={site} bottomGuides={bottomGuides} />
        </div>
      </body>
    </html>
  )
}
