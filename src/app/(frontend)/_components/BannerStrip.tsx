import React from 'react'

import type { Banner } from '@/payload-types'
import { resolveDisplayLink } from '@/site/nav'
import { NavLink } from './NavLink'

/**
 * Home-page banner strip (Task 4E; refs 1-51/1-52, 2-1). A horizontal row of
 * linked banner images — the eGov main page's "이미지 배너" strip. The caller
 * (`page.tsx`) has already resolved the LIVE, `displayOrder`-sorted banners
 * for the active site (`getActiveBanners`); this component is pure rendering.
 * Renders nothing when there are no live banners (no empty section) or when a
 * banner's `image` did not populate to a Media doc with a `url` (defensive —
 * should not happen given the collection requires `image`).
 */
export function BannerStrip({ banners }: { banners: Banner[] }) {
  const items = banners.filter((banner) => typeof banner.image === 'object' && banner.image.url)
  if (items.length === 0) {
    return null
  }

  return (
    <section className="banner-strip" aria-label="Banners">
      <ul className="banner-strip__list" role="list">
        {items.map((banner) => {
          // Guarded by the filter above; narrow for TS.
          const image = banner.image as Extract<Banner['image'], { url?: string | null }>
          const alt = image.alt || banner.title
          const link = resolveDisplayLink(banner)
          const img = (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin CMS asset
            <img
              className="banner-strip__img"
              src={image.url ?? undefined}
              alt={alt}
              loading="lazy"
            />
          )
          return (
            <li key={banner.id} className="banner-strip__item">
              {link.kind === 'link' ? (
                <NavLink link={link} className="banner-strip__link">
                  {img}
                </NavLink>
              ) : (
                img
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
