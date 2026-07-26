import Link from 'next/link'
import React from 'react'

import type { ResolvedLink } from '@/site/nav'

/**
 * Renders a resolved nav/guide/breadcrumb target consistently across the
 * public chrome. A `none` link is a non-clickable `<span>` (placeholder/program
 * section labels); an internal link uses `next/link`; an external link is a
 * plain anchor hardened with `rel="noopener noreferrer"`. `newWindow` opens a
 * new tab for either kind. The link's href was already re-validated by
 * `resolveMenuLink`/`resolveGuideLink`, so it is safe to render here.
 */
export function NavLink({
  link,
  children,
  className,
  'aria-current': ariaCurrent,
}: {
  link: ResolvedLink
  children: React.ReactNode
  className?: string
  'aria-current'?: React.AriaAttributes['aria-current']
}) {
  if (link.kind === 'none') {
    return <span className={className}>{children}</span>
  }
  const newWindow = link.newWindow ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  if (link.external) {
    return (
      <a
        href={link.href}
        className={className}
        aria-current={ariaCurrent}
        rel="noopener noreferrer"
        {...(link.newWindow ? { target: '_blank' } : {})}
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={link.href} className={className} aria-current={ariaCurrent} {...newWindow}>
      {children}
    </Link>
  )
}
