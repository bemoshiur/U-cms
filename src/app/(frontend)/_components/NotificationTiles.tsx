import React from 'react'

import type { NotificationArea } from '@/payload-types'
import { resolveDisplayLink } from '@/site/nav'
import { NavLink } from './NavLink'

/**
 * Home-page notification-area tile grid (Task 4E; refs 1-45/1-46, 2-1). Larger
 * (490×245) linked image tiles — the eGov main page's "알림 영역" slots, a
 * third home-page section alongside Notices / Quick menu. The caller
 * (`page.tsx`) has already resolved the LIVE, `displayOrder`-sorted areas
 * (`getActiveNotificationAreas`); this component is pure rendering. Renders
 * nothing when there are none live.
 */
export function NotificationTiles({ areas }: { areas: NotificationArea[] }) {
  const items = areas.filter((area) => typeof area.image === 'object' && area.image.url)
  if (items.length === 0) {
    return null
  }

  return (
    <section className="home-panel notification-tiles" aria-labelledby="notifications-heading">
      <div className="home-panel__head">
        <h2 id="notifications-heading" className="home-panel__title">
          Notifications
        </h2>
      </div>
      <ul className="notification-tiles__grid" role="list">
        {items.map((area) => {
          const image = area.image as Extract<NotificationArea['image'], { url?: string | null }>
          const alt = image.alt || area.title
          const link = resolveDisplayLink(area)
          const tile = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- same-origin CMS asset */}
              <img
                className="notification-tiles__img"
                src={image.url ?? undefined}
                alt={alt}
                loading="lazy"
              />
              <span className="notification-tiles__title">{area.title}</span>
            </>
          )
          return (
            <li key={area.id} className="notification-tiles__item">
              {link.kind === 'link' ? (
                <NavLink link={link} className="notification-tiles__link">
                  {tile}
                </NavLink>
              ) : (
                <div className="notification-tiles__link">{tile}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
