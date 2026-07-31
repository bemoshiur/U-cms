import React from 'react'

import { isValidationActive, parseValidationMode } from '@/accessibility/validationMode'
import { branding } from '@/branding'
import type { Popup } from '@/payload-types'
import { getCurrentMember } from '@/site/member'
import { buildNav, resolveDisplayLink } from '@/site/nav'
import { getActiveGuideMenus, getActivePopups, getActiveSite, getActiveSiteMenus } from '@/site/rsc'
import { AccessibilityValidator } from './_components/AccessibilityValidator'
import type { PopupItem } from './_components/PopupLayer'
import { PopupLayer } from './_components/PopupLayer'
import { SiteFooter } from './_components/SiteFooter'
import { SiteHeader } from './_components/SiteHeader'
import { TrafficBeacon } from './_components/TrafficBeacon'
import './styles.css'

/**
 * Maps a live `popups` doc (Payload shape) to the plain-data props the client
 * `PopupLayer` needs — `null` when the image did not populate to a Media doc
 * with a `url` (defensive; the collection requires `image`). Defaults mirror
 * the collection's own field defaults (`Popups.ts`) for a doc created before
 * those defaults existed.
 */
function toPopupItem(popup: Popup): PopupItem | null {
  const image = typeof popup.image === 'object' ? popup.image : null
  if (!image?.url) {
    return null
  }
  return {
    id: popup.id,
    title: popup.title,
    imageUrl: image.url,
    imageAlt: image.alt || popup.title,
    link: resolveDisplayLink(popup),
    width: popup.width ?? 400,
    height: popup.height ?? 300,
    top: popup.top ?? 100,
    left: popup.left ?? 100,
    showScrollbar: Boolean(popup.showScrollbar),
    closeForDay: popup.closeForDay !== false,
  }
}

export const metadata = {
  title: branding.productName,
  description: branding.tagline,
}

/**
 * The public chrome is MEMBER-AWARE: this layout reads the visitor's session via
 * `getCurrentMember` → `headers()`, which is a dynamic API. That alone opts every
 * nested `(frontend)` route into per-request dynamic rendering, so a CI build
 * (before the DB is seeded) never statically prerenders empty chrome — the reason
 * the old explicit `force-dynamic` existed. It is dropped here so page-level
 * `revalidate` is honoured for the Data Cache rather than being forced to 0.
 *
 * The performance win lives one layer down: the global, non-user-specific shell
 * resolvers (active site, menus, guide bars, footer) are wrapped in
 * `unstable_cache` (see `src/site/rsc.ts`), so a warm data cache serves them
 * without re-querying Payload/DB per request. The session read stays uncached
 * (correctness).
 */

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
  const [site, menus, topGuides, bottomGuides, member, popups] = await Promise.all([
    getActiveSite(),
    getActiveSiteMenus(),
    getActiveGuideMenus('top'),
    getActiveGuideMenus('bottom'),
    getCurrentMember(),
    getActivePopups(),
  ])

  const navNodes = buildNav(menus, { member })
  const popupItems = popups.map(toPopupItem).filter((item): item is PopupItem => item !== null)

  // Web-accessibility validation toggle (Task 8.2 / TODO 8.3, ACS_VLD_USE_CD).
  // Only mount the client validator when the site's mode does something —
  // `off` renders nothing at all (a true no-op; keeps the public site untouched).
  const validationMode = parseValidationMode(
    (site as { accessibilityValidation?: unknown } | null)?.accessibilityValidation,
  )

  return (
    <html lang="en">
      <head>
        {/* Pretendard (KRDS primary face) via CDN; a Korean-capable fallback
            stack in styles.css keeps the site correct if the CDN is blocked. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
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
        {/* Privacy-conscious traffic capture (feeds Phase-5 stats) — no PII. */}
        <TrafficBeacon />
        {/* Site-wide popups (팝업) — live for the active site, dismiss-for-a-day handled client-side. */}
        <PopupLayer popups={popupItems} />
        {/* Accessibility auto-diagnosis toggle (dev/local only; no-op when off). */}
        {isValidationActive(validationMode) ? (
          <AccessibilityValidator mode={validationMode} />
        ) : null}
      </body>
    </html>
  )
}
