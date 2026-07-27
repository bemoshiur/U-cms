import type { ServerProps } from 'payload'
import React from 'react'

import { ACCESSIBILITY_MENU_KEY } from '@/accessibility/constants'
import { hasMenuAccessSync } from '@/access/hasMenuAccess'
import { DOWNLOAD_STATS_MENU_KEY } from '@/endpoints/downloadStatsExport'
import { ERROR_LOGS_MENU_KEY } from '@/endpoints/errorStatsExport'
import { SATISFACTION_MENU_KEY } from '@/endpoints/satisfactionStatsExport'
import { TRAFFIC_DAILY_MENU_KEY } from '@/endpoints/trafficExport'
import { ACCESS_HISTORY_MENU_KEY } from '@/site/accessHistoryData'

/**
 * Nav links to the custom statistics views (Task 5A traffic + Task 5B downloads
 * & satisfaction), rendered in `admin.components.afterNavLinks`. A custom
 * top-level admin view has no auto-generated nav entry, so this adds one PER
 * view — each hidden from anyone without that view's grant (using the same
 * synchronous, populated-`user` check the gated collections use for nav
 * visibility; each VIEW itself remains the real gate). Server component: reads
 * `user` from ServerProps.
 */
const LINKS: { menuKey: string; href: string; label: string }[] = [
  {
    menuKey: TRAFFIC_DAILY_MENU_KEY,
    href: '/admin/traffic-statistics',
    label: 'Traffic Statistics',
  },
  {
    menuKey: DOWNLOAD_STATS_MENU_KEY,
    href: '/admin/download-statistics',
    label: 'Download Statistics',
  },
  {
    menuKey: SATISFACTION_MENU_KEY,
    href: '/admin/satisfaction-statistics',
    label: 'Satisfaction Statistics',
  },
  // Task 5C: error-log statistics (system.errorLogs) + the site access-history
  // view (privacy.accessLogs). Each hidden from anyone without that grant.
  {
    menuKey: ERROR_LOGS_MENU_KEY,
    href: '/admin/error-statistics',
    label: 'Error Statistics',
  },
  {
    menuKey: ACCESS_HISTORY_MENU_KEY,
    href: '/admin/access-history',
    label: 'Access History',
  },
  // Task 8.2: web-accessibility auto-diagnosis results (2-21/2-22) + statistics
  // (2-23), both gated on statistics.accessibility.
  {
    menuKey: ACCESSIBILITY_MENU_KEY,
    href: '/admin/accessibility-diagnosis',
    label: 'Accessibility Diagnosis',
  },
  {
    menuKey: ACCESSIBILITY_MENU_KEY,
    href: '/admin/accessibility-statistics',
    label: 'Accessibility Statistics',
  },
]

export function StatisticsNavLink(props: ServerProps): React.ReactElement | null {
  const visible = LINKS.filter((l) => hasMenuAccessSync(props.user, l.menuKey))
  if (visible.length === 0) {
    return null
  }
  return (
    <>
      {visible.map((l) => (
        // A full-navigation anchor (not next/link): these are Payload admin routes
        // served by Payload's catch-all, and a hard navigation reliably re-renders
        // the server view. The href is a variable (not a literal page path), so the
        // next/link rule doesn't apply.
        <a
          key={l.href}
          href={l.href}
          className="nav__link"
          style={{ display: 'block', padding: '.5rem .75rem' }}
        >
          {l.label}
        </a>
      ))}
    </>
  )
}
