import type { ServerProps } from 'payload'
import React from 'react'

import { hasMenuAccessSync } from '@/access/hasMenuAccess'
import { SECURITY_DOCS_MENU_KEY } from '@/access/securityDocs'
import { PASSWORD_POLICY_MENU_KEY } from '@/privacy/passwordPolicyData'
import { PRIVACY_ORG_MENU_KEY } from '@/privacy/orgChart'

/** loginHistory backs all three legacy screens via saved `?where=` filters (ref 3-5..3-7). */
const LOGIN_HISTORY_MENU_KEY = 'privacy.loginHistory'

/**
 * Nav links wiring the §3 Privacy Protection System together (Task 6C + 6D).
 * Rendered in `admin.components.afterNavLinks`. A custom top-level admin view —
 * and a pre-filtered collection list — has no auto-generated nav entry, so this
 * adds one per surface, each hidden from anyone without that surface's grant
 * (the same synchronous, populated-`user` check the gated collections use for
 * nav visibility; the VIEW/collection `access` itself remains the real gate).
 *
 * Covers: the two Task 6C custom views (password policy — ref 3-9; org chart —
 * ref 3-10), the four security-document libraries (ref 3-4, ONE filtered
 * `boards` list), and the three legacy pre-filtered login-history screens
 * (overseas / mobile / failure — refs 3-5/3-6, all filtered views of the one
 * `loginHistory` collection). Server component.
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
  {
    menuKey: SECURITY_DOCS_MENU_KEY,
    href: '/admin/collections/boards?where[or][0][and][0][securityDoc][equals]=true',
    label: 'Security Documents',
  },
  {
    menuKey: LOGIN_HISTORY_MENU_KEY,
    href: '/admin/collections/loginHistory?where[or][0][and][0][isOverseas][equals]=true',
    label: 'Overseas Login Attempts',
  },
  {
    menuKey: LOGIN_HISTORY_MENU_KEY,
    href: '/admin/collections/loginHistory?where[or][0][and][0][isMobile][equals]=true',
    label: 'Mobile Login History',
  },
  {
    menuKey: LOGIN_HISTORY_MENU_KEY,
    href: '/admin/collections/loginHistory?where[or][0][and][0][success][equals]=false',
    label: 'Login Failure History',
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
