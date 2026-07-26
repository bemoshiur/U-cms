import type { ServerProps } from 'payload'
import React from 'react'

import { hasMenuAccessSync } from '@/access/hasMenuAccess'
import { PASSWORD_POLICY_MENU_KEY } from '@/privacy/passwordPolicyData'
import { PRIVACY_ORG_MENU_KEY } from '@/privacy/orgChart'

/**
 * Nav links to the Task 6C custom privacy views — the password-policy
 * management screen (ref 3-9) and the auto-generated privacy org chart (ref
 * 3-10). Rendered in `admin.components.afterNavLinks` alongside the statistics
 * links. A custom top-level admin view has no auto-generated nav entry, so this
 * adds one PER view — each hidden from anyone without that view's grant (the
 * same synchronous, populated-`user` check the gated collections use for nav
 * visibility; each VIEW itself remains the real gate). Server component.
 */
const LINKS: { menuKey: string; href: string; label: string }[] = [
  {
    menuKey: PASSWORD_POLICY_MENU_KEY,
    href: '/admin/password-policies',
    label: 'Password Composition Rules',
  },
  {
    menuKey: PRIVACY_ORG_MENU_KEY,
    href: '/admin/privacy-org-chart',
    label: 'Privacy Organization Chart',
  },
]

export function PrivacyNavLink(props: ServerProps): React.ReactElement | null {
  const visible = LINKS.filter((l) => hasMenuAccessSync(props.user, l.menuKey))
  if (visible.length === 0) {
    return null
  }
  return (
    <>
      {visible.map((l) => (
        // A full-navigation anchor (not next/link): these are Payload admin
        // routes served by Payload's catch-all, and a hard navigation reliably
        // re-renders the server view. The href is a variable, so the next/link
        // rule does not apply.
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

export default PrivacyNavLink
