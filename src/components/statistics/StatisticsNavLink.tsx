import type { ServerProps } from 'payload'
import React from 'react'

import { hasMenuAccessSync } from '@/access/hasMenuAccess'
import { TRAFFIC_DAILY_MENU_KEY } from '@/endpoints/trafficExport'

/**
 * Nav link to the custom Traffic Statistics view (Task 5A; TODO 5.2), rendered
 * in `admin.components.afterNavLinks`. A custom top-level admin view has no
 * auto-generated nav entry, so this adds one — and hides it from anyone without
 * the `statistics.traffic` grant (using the same synchronous, populated-`user`
 * check the gated collections use for nav visibility; the VIEW itself remains
 * the real gate). Server component: it reads `user` from ServerProps.
 */
export function StatisticsNavLink(props: ServerProps): React.ReactElement | null {
  if (!hasMenuAccessSync(props.user, TRAFFIC_DAILY_MENU_KEY)) {
    return null
  }
  return (
    // A full-navigation anchor (not next/link): this is a Payload admin route
    // served by Payload's catch-all, and a hard navigation reliably re-renders
    // the server view. eslint's next/link rule doesn't apply to admin routes.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/admin/traffic-statistics"
      className="nav__link"
      style={{ display: 'block', padding: '.5rem .75rem' }}
    >
      Traffic Statistics
    </a>
  )
}
