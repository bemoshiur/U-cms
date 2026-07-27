import type { ServerProps } from 'payload'
import React from 'react'

import { hasMenuAccessSync } from '@/access/hasMenuAccess'
import {
  STD_CODE_SPEC_MENU_KEY,
  STD_META_INSPECTION_MENU_KEY,
  STD_SELF_CHECK_MENU_KEY,
  STD_SELF_CHECK_STATS_MENU_KEY,
  STD_TABLE_SETTINGS_MENU_KEY,
} from '@/standardization/constants'

/**
 * Nav links to the custom Standardization admin VIEWS (Phase 8, Tasks 8.1a/8.1b),
 * rendered in `admin.components.afterNavLinks`. The dictionary + engine
 * COLLECTIONS get auto-generated nav entries under their groups, but the
 * read-only REPORT / INSPECTION / STATISTICS views are custom top-level views
 * with no auto entry — so this adds them, each hidden from anyone without the
 * relevant DBA grant (same synchronous, populated-`user` check the gated
 * collections use for nav visibility; the VIEW itself remains the real gate).
 * Server component. (Table Standard Settings has both a collection AND a custom
 * summary/batch view; the self-check statistics + meta-inspection are view-only.)
 */
const LINKS: { menuKey: string; href: string; label: string }[] = [
  {
    menuKey: STD_CODE_SPEC_MENU_KEY,
    href: '/admin/code-specification',
    label: 'Code Specification',
  },
  {
    menuKey: STD_META_INSPECTION_MENU_KEY,
    href: '/admin/meta-inspection',
    label: 'Meta Term Inspection',
  },
  {
    menuKey: STD_TABLE_SETTINGS_MENU_KEY,
    href: '/admin/table-standard-settings',
    label: 'Table Standard Settings (view)',
  },
  {
    menuKey: STD_SELF_CHECK_MENU_KEY,
    href: '/admin/standardization-self-check',
    label: 'Self-Check (run + results)',
  },
  {
    menuKey: STD_SELF_CHECK_STATS_MENU_KEY,
    href: '/admin/standardization-self-check-statistics',
    label: 'Self-Check Statistics',
  },
]

export function StandardizationNavLink(props: ServerProps): React.ReactElement | null {
  const visible = LINKS.filter((l) => hasMenuAccessSync(props.user, l.menuKey))
  if (visible.length === 0) {
    return null
  }
  return (
    <>
      {visible.map((l) => (
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
