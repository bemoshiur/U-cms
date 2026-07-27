import type { ServerProps } from 'payload'
import React from 'react'

import { hasMenuAccessSync } from '@/access/hasMenuAccess'
import { STD_CODE_SPEC_MENU_KEY } from '@/standardization/constants'

/**
 * Nav link to the custom Code Specification report view (Phase 8, Task 8.1a;
 * ref 1-74), rendered in `admin.components.afterNavLinks`. The three dictionary
 * collections (standardDomains/words/terms) get auto-generated nav entries under
 * their group, but the code-spec REPORT is a custom top-level view with no auto
 * entry — so this adds one, hidden from anyone without the DBA code-spec grant
 * (same synchronous, populated-`user` check the gated collections use for nav
 * visibility; the VIEW itself remains the real gate). Server component.
 */
const LINKS: { menuKey: string; href: string; label: string }[] = [
  {
    menuKey: STD_CODE_SPEC_MENU_KEY,
    href: '/admin/code-specification',
    label: 'Code Specification',
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
