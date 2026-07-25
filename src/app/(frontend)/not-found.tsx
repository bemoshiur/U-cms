import Link from 'next/link'
import React from 'react'

/**
 * Branded 404 for the public site — rendered inside the site chrome (the root
 * `(frontend)/layout`) whenever a page calls `notFound()` (unknown/cross-site
 * menu, board, or post) or a URL matches no route.
 */
export default function NotFound() {
  return (
    <div className="page page--error">
      <p className="page__eyebrow">404</p>
      <h1 className="page__title">Page not found</h1>
      <p className="page__placeholder">The page you are looking for does not exist on this site.</p>
      <p>
        <Link href="/" className="button">
          Back to home
        </Link>
      </p>
    </div>
  )
}
